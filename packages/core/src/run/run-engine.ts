import type { Owner, RunSnapshot } from "@runyard/protocol";
import { type Run, RunSession } from "./run-session.ts";
import { isActiveState } from "./run-transitions.ts";
import type { RunEngineDeps, StartRequest } from "./run-types.ts";

export type StartResult = {
  readonly run: Run;
  /** 对活动中的项目再次启动时 `alreadyRunning` 为 true（规格 RUN-LIFECYCLE-12） */
  readonly snapshot: RunSnapshot;
};

/**
 * 运行引擎：一个项目同时只有一次活动的运行，每次运行一个 RunSession。
 * 不知道标签页和命令行是什么；持有者只是运行上的字段（谁来管它属于 supervisor）。
 */
export class RunEngine {
  readonly #deps: RunEngineDeps;
  readonly #runs = new Map<string, RunSession>();
  readonly #current = new Map<string, RunSession>();
  #counter = 0;

  constructor(deps: RunEngineDeps) {
    this.#deps = deps;
  }

  start(request: StartRequest): StartResult {
    const existing = this.#current.get(request.playgroundId);
    // 登记是同步的：并发的两个启动请求里，后到的一定看见先到的（规格 RUN-LIFECYCLE-13）
    if (existing !== undefined && isActiveState(existing.state)) {
      return { run: existing, snapshot: { ...existing.snapshot(), alreadyRunning: true } };
    }
    this.#counter += 1;
    const runId = this.#deps.newRunId?.() ?? `run-${this.#counter}`;
    const session = new RunSession(runId, request, {
      deps: this.#deps,
      runningCount: () => this.runningCount(),
    });
    this.#runs.set(runId, session);
    this.#current.set(request.playgroundId, session);
    session.begin();
    return { run: session, snapshot: session.snapshot() };
  }

  get(runId: string): Run | undefined {
    return this.#runs.get(runId);
  }

  /** 项目当前（最近一次）的运行，不管结束没有 */
  current(playgroundId: string): Run | undefined {
    return this.#current.get(playgroundId);
  }

  list(): Run[] {
    return [...this.#runs.values()];
  }

  /** “N 个运行中”：七个活动状态，不分持有者、不分种类 */
  runningCount(): number {
    let count = 0;
    for (const session of this.#runs.values()) if (isActiveState(session.state)) count += 1;
    return count;
  }

  /** 先停止再启动，端口不变（规格 RUN-LIFECYCLE-22）。返回新的一次运行 */
  async restart(runId: string): Promise<StartResult | undefined> {
    const session = this.#runs.get(runId);
    if (session === undefined) return undefined;
    const port = session.port ?? session.request.port;
    await session.stop();
    return this.start({
      ...session.request,
      owner: session.owner,
      ...(port === undefined ? {} : { port }),
    });
  }

  /** 停止全部活动的运行；`mine` 只停命令行持有的（规格 RUN-LIFECYCLE-23） */
  async stopAll(options: { mine?: boolean } = {}): Promise<RunSnapshot[]> {
    const targets = [...this.#runs.values()].filter(
      (session) => isActiveState(session.state) && (!options.mine || isCliOwned(session.owner)),
    );
    return Promise.all(targets.map((session) => session.stop()));
  }
}

function isCliOwned(owner: Owner): boolean {
  return owner.kind === "cli";
}
