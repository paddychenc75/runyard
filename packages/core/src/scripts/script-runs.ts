import { type Disposable, type Platform, posixRelPath } from "@runyard/platform";
import type { RunyardError } from "@runyard/protocol";
import type { RunSubject } from "../prepare/prepare-types.ts";
import { resolveExecutable } from "../prepare/resolve-executable.ts";
import { expandCommand } from "../run/expand-command.ts";
import type { RunClock } from "../run/run-clock.ts";
import type { RunEngine, StartResult } from "../run/run-engine.ts";
import { buildRunEnv, type RunNetworkSettings } from "../run/run-env.ts";
import { isActiveState } from "../run/run-transitions.ts";
import type { StartRequest } from "../run/run-types.ts";
import type { ToolchainService } from "../toolchain/toolchain-service.ts";
import { type CheckResult, checkScript } from "./check-script.ts";
import { ignoredDirectories, isWatched } from "./watch-glob.ts";

// 脚本和“监听文件变化”的重跑（规格 run/scripts）：
//   - 手动运行（start）：脚本声明了 check 就先检查，不通过不运行，返回 SCRIPT_ERRORED（RUN-SCRIPTS-17）；
//     对活动中的脚本再 run 仍返回现有运行并带 alreadyRunning（RUN-SCRIPTS-21），不重新检查。
//   - 监听（watch）：`rerun`（脚本）文件变化后先检查，通过才先停旧的再起新的；不通过不产生新的运行，
//     把上一次的运行标 stale（RUN-SCRIPTS-15、16、20）。`restart`（服务）停了再起，期间 reloading，端口不变。
//   - 去抖：窗口内连续保存只触发一次（RUN-SCRIPTS-13）；忽略路径的变化不触发（RUN-SCRIPTS-14）。
// 自动运行的开关由装配方判断（全局设置和项目开关任何一个为关就不自动运行，RUN-SCRIPTS-10、11），
// 关闭时手动运行仍可用（RUN-SCRIPTS-12）：开关只管 watch，不管 start。

export const DEFAULT_DEBOUNCE_MS = 300;

export type ScriptRunsDeps = {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly engine: Pick<RunEngine, "start" | "current">;
  readonly toolchain: Pick<ToolchainService, "check">;
  readonly resolve: (request: StartRequest) => Promise<RunSubject>;
  /** 全局 `scriptAutoRun` 与项目 `script.autoRun` 都没关 */
  readonly autoRunEnabled: (playgroundId: string) => Promise<boolean>;
  readonly network?: () => RunNetworkSettings | undefined;
};

export type ScriptStart =
  | { readonly ok: true; readonly started: StartResult }
  | { readonly ok: false; readonly error: RunyardError<"SCRIPT_ERRORED"> };

export class ScriptRuns {
  readonly #deps: ScriptRunsDeps;
  readonly #chains = new Map<string, Promise<void>>();

  constructor(deps: ScriptRunsDeps) {
    this.#deps = deps;
  }

  /** 手动运行 */
  async start(request: StartRequest): Promise<ScriptStart> {
    const { engine } = this.#deps;
    const current = engine.current(request.playgroundId);
    if (current !== undefined && isActiveState(current.state) && current.state !== "stopping") {
      return { ok: true, started: engine.start(request) };
    }
    const gate = await this.#gate(request);
    if (gate !== undefined && !gate.ok) {
      current?.markStale(gate.entries);
      return {
        ok: false,
        error: {
          code: "SCRIPT_ERRORED",
          params: { name: request.name },
          debug: "syntax check failed; the script was not run",
          cause: { outputTail: gate.outputTail },
        },
      };
    }
    return { ok: true, started: engine.start(request) };
  }

  /** 开始监听这个项目的文件变化；`watch.mode` 为 none 时什么也不做。返回的对象停止监听 */
  async watch(request: StartRequest): Promise<Disposable> {
    const { platform, clock } = this.#deps;
    const subject = await this.#deps.resolve(request);
    const rule = subject.runner.watch;
    if (rule.mode === "none") return { dispose: async () => undefined };

    let timer: number | undefined;
    const fire = () => {
      timer = undefined;
      this.#enqueue(request.playgroundId, () =>
        rule.mode === "rerun" ? this.#rerun(request) : this.#restart(request),
      );
    };
    const ignore = ignoredDirectories(rule.ignore).map((dir) => posixRelPath(dir));
    const watcher = await platform.watch(subject.folder, { ignore }, (events) => {
      if (!events.some((event) => isWatched(event.path, rule))) return;
      if (timer !== undefined) clock.clearTimeout(timer);
      timer = clock.setTimeout(fire, rule.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    });
    return {
      dispose: async () => {
        if (timer !== undefined) clock.clearTimeout(timer);
        timer = undefined;
        await watcher.dispose();
      },
    };
  }

  // 同一个项目的重跑一个接一个：检查和停止都是异步的，不能让两次触发交叠
  #enqueue(playgroundId: string, task: () => Promise<void>): void {
    const previous = this.#chains.get(playgroundId) ?? Promise.resolve();
    this.#chains.set(
      playgroundId,
      previous.then(task).catch(() => undefined),
    );
  }

  async #rerun(request: StartRequest): Promise<void> {
    const { engine } = this.#deps;
    if (!(await this.#deps.autoRunEnabled(request.playgroundId))) return;
    const current = engine.current(request.playgroundId);
    const gate = await this.#gate(request);
    if (gate !== undefined && !gate.ok) {
      current?.markStale(gate.entries);
      return;
    }
    // 先把旧的整棵停掉、确认为空，再起新的，任何时刻只有一个脚本进程（RUN-SCRIPTS-20）
    if (current !== undefined && isActiveState(current.state)) await current.stop();
    engine.start(request);
  }

  async #restart(request: StartRequest): Promise<void> {
    const current = this.#deps.engine.current(request.playgroundId);
    if (current?.state === "ready") await current.reload();
  }

  /** 运行器声明了 check 才有；没声明，或工具链本身就不通过（交给启动去报 TOOL_MISSING）时返回 undefined */
  async #gate(request: StartRequest): Promise<CheckResult | undefined> {
    const { platform, toolchain } = this.#deps;
    const subject = await this.#deps.resolve(request);
    const check = subject.runner.check;
    if (request.kind !== "oneshot" || check === undefined) return undefined;
    const checked = await toolchain.check({ requires: subject.requires, cwd: subject.folder });
    if (checked.errors.length > 0) return undefined;
    const loaded = await platform.env.load({ cwd: subject.folder });
    const network = this.#deps.network?.();
    const env = {
      ...buildRunEnv({
        base: loaded.env,
        runDefaults: platform.env.runDefaults(),
        ...(subject.runner.run?.env === undefined ? {} : { runnerEnv: subject.runner.run.env }),
        ...(network === undefined ? {} : { network }),
      }),
    };
    const expanded = expandCommand(check.command, {
      ...(subject.entry === undefined ? {} : { entry: subject.entry }),
      dir: subject.folder,
      name: request.name,
    });
    return checkScript({
      platform,
      clock: this.#deps.clock,
      argv: await resolveExecutable(platform, expanded, checked, subject.folder, env),
      cwd: subject.folder,
      env,
      ...(check.timeoutMs === undefined ? {} : { timeoutMs: check.timeoutMs }),
    });
  }
}
