import {
  endStates,
  isActiveState,
  type Run,
  type RunEngine,
  type ScriptRuns,
  type StartRequest,
} from "@runyard/core";
import type { Owner, RunSnapshot, RunState, WaitMode } from "@runyard/protocol";
import { MethodFailure, methodFailure } from "./method-failure.ts";
import type { OwnerBindings } from "./run-owners.ts";
import type { RunSubjects } from "./run-subjects.ts";
import type { Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 运行编排：把“按名称找项目、持有者绑定、等待模式、停止中再启动”接在 core 的运行引擎上。
// 方法处理函数（run-handlers.ts）和资源库用的 RunsView（run-module.ts）都经它。

/** 上一次运行还在停止时，新的启动最多等多久；超过报 BUSY（规格 CLI-COMMANDS-79）。
 *  停止本身最长约 graceMs 加 2 秒等后代加 3 秒等端口，取 10 秒 */
export const STOP_WAIT_LIMIT_MS = 10_000;

export interface StartArgs {
  readonly ref: string;
  readonly owner: Owner;
  readonly port?: number | undefined;
  readonly wait: WaitMode;
  readonly timeoutMs?: number | undefined;
  /** 请求所在的连接；资源库改名后的重启没有 */
  readonly session?: Session | undefined;
}

export interface RunControlDeps {
  readonly api: SupervisorApi;
  readonly engine: RunEngine;
  readonly scripts: ScriptRuns;
  readonly subjects: RunSubjects;
  readonly owners: OwnerBindings;
  /** 启动前刷新运行时用的设置（端口范围、工具路径） */
  readonly refreshSettings: () => Promise<void>;
  /** 命令提到了这次运行（#42 据此给空闲计时归零） */
  readonly mentioned: (run: Run, session: Session | undefined) => void;
  /** 有人明确要求停止这个项目的运行（`runyard stop`）：脚本的自动重跑监听据此结束（#138） */
  readonly stopRequested: (playgroundId: string) => void;
  /** 应用的某个客户端断开或告别：它的标签页持有的监听随之结束 */
  readonly tabsGone?: (clientId: string) => void;
  readonly stopWaitLimitMs?: number;
}

export class RunControl {
  readonly #d: RunControlDeps;

  constructor(deps: RunControlDeps) {
    this.#d = deps;
  }

  get engine(): RunEngine {
    return this.#d.engine;
  }

  async start(args: StartArgs): Promise<RunSnapshot> {
    const { api, engine, scripts, subjects, owners } = this.#d;
    const { item, runner } = await subjects.lookup(args.ref);
    await this.#d.refreshSettings();
    const id = item.entry.id;
    await (await api.openLibrary()).markUsed(id);

    const request: StartRequest = {
      playgroundId: id,
      name: item.name,
      kind: runner.kind,
      owner: args.owner,
      ...(args.port === undefined ? {} : { port: args.port }),
    };
    const previous = engine.current(id);
    const waitsForStop = previous?.state === "stopping" ? previous : undefined;
    let started: ReturnType<RunEngine["start"]>;
    if (runner.kind === "oneshot") {
      const result = await scripts.start(request);
      if (!result.ok) throw new MethodFailure(result.error);
      started = result.started;
    } else {
      started = engine.start(request);
    }
    const { run, snapshot } = started;
    const already = snapshot.alreadyRunning === true;
    if (!already && args.owner.kind === "tab" && args.session !== undefined) {
      owners.bind(args.owner.clientId, args.session);
    }
    this.#d.mentioned(run, args.session);
    if (waitsForStop !== undefined && args.wait !== "none") {
      await this.#awaitPreviousStop(waitsForStop, run);
    }
    return this.#waitFor(run, args, already);
  }

  // 新的运行在 core 里排在旧的停止之后；停止一直不完成时撤销新的，报 BUSY，不留下一个永远等着的运行
  async #awaitPreviousStop(previous: Run, fresh: Run): Promise<void> {
    const { clock } = this.#d.api;
    let timer: number | undefined;
    const limit = new Promise<"timeout">((resolve) => {
      timer = clock.setTimeout(
        () => resolve("timeout"),
        this.#d.stopWaitLimitMs ?? STOP_WAIT_LIMIT_MS,
      );
    });
    const outcome = await Promise.race([previous.waitFor(endStates).then(() => "done"), limit]);
    if (timer !== undefined) clock.clearTimeout(timer);
    if (outcome === "timeout") {
      // 撤销新的运行：它排在旧的停止之后，所以这里不能等；旧的停完之后它直接收尾，不会起进程
      void fresh.stop().catch(() => undefined);
      throw methodFailure(
        "BUSY",
        { name: fresh.request.name },
        "the previous run did not finish stopping in time",
      );
    }
  }

  async #waitFor(run: Run, args: StartArgs, already: boolean): Promise<RunSnapshot> {
    const { clock } = this.#d.api;
    const withFlag = (snapshot: RunSnapshot): RunSnapshot => ({
      ...snapshot,
      alreadyRunning: already,
    });
    if (args.wait === "none") return withFlag(run.snapshot());
    // 脚本没有“就绪”，等它结束
    const states: readonly RunState[] =
      args.wait === "exit" || run.request.kind === "oneshot" ? endStates : ["ready"];
    let timer: number | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      if (args.timeoutMs !== undefined) {
        timer = clock.setTimeout(() => resolve("timeout"), args.timeoutMs);
      }
    });
    const outcome = await Promise.race([run.waitFor(states).then(() => "reached"), timeout]);
    if (timer !== undefined) clock.clearTimeout(timer);
    if (outcome === "timeout") {
      // 只决定这次调用何时返回，不杀进程
      throw methodFailure(
        "READY_TIMEOUT",
        { name: run.request.name, seconds: Math.round((args.timeoutMs ?? 0) / 1000) },
        "the run did not reach the wanted state in time",
      );
    }
    const final = run.snapshot();
    const failure = run.error();
    if ((final.state === "failed" || final.state === "errored") && failure !== undefined) {
      throw new MethodFailure(failure);
    }
    return withFlag(final);
  }

  /** 按运行 id 或项目找运行；项目没有任何运行记录时 RUN_NOT_FOUND */
  async find(target: {
    runId?: string | undefined;
    playground?: string | undefined;
  }): Promise<Run> {
    const { engine, subjects } = this.#d;
    if (target.runId !== undefined) return this.get(target.runId);
    const ref = target.playground ?? "";
    const item = await subjects.item(ref);
    const run = engine.current(item.entry.id);
    if (run === undefined) {
      throw methodFailure("RUN_NOT_FOUND", { runId: ref }, `no run for ${ref}`);
    }
    return run;
  }

  get(runId: string): Run {
    const run = this.#d.engine.get(runId);
    if (run === undefined) throw methodFailure("RUN_NOT_FOUND", { runId }, `no run ${runId}`);
    return run;
  }

  async stop(
    target: { runId?: string | undefined; playground?: string | undefined },
    session: Session | undefined,
  ): Promise<RunSnapshot> {
    const run = await this.find(target);
    this.#d.mentioned(run, session);
    this.#d.stopRequested(run.request.playgroundId);
    return run.stop();
  }

  async restart(ref: string, session: Session | undefined): Promise<RunSnapshot> {
    const run = await this.find({ playground: ref });
    this.#d.mentioned(run, session);
    await this.#d.refreshSettings();
    const restarted = await this.#d.engine.restart(run.runId);
    if (restarted === undefined) throw methodFailure("RUN_NOT_FOUND", { runId: run.runId }, "gone");
    const owner = restarted.snapshot.owner;
    if (owner.kind === "tab" && session !== undefined) this.#d.owners.bind(owner.clientId, session);
    return { ...restarted.snapshot, alreadyRunning: false };
  }

  /** 这个 clientId 名下仍在进行的标签页运行 */
  tabRunsOf(clientId: string): Run[] {
    return this.#d.engine.list().filter((run) => {
      const { owner } = run.snapshot();
      return isActiveState(run.state) && owner.kind === "tab" && owner.clientId === clientId;
    });
  }

  async stopTabRunsOf(clientId: string): Promise<void> {
    // 已经跑完的脚本也还在被监听：客户端没了，监听跟着结束
    this.#d.tabsGone?.(clientId);
    await Promise.all(this.tabRunsOf(clientId).map((run) => run.stop()));
  }
}
