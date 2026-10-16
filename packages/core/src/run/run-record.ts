import type {
  FailureReason,
  LogEntry,
  Notice,
  Owner,
  RunSnapshot,
  RunState,
  RunyardError,
} from "@runyard/protocol";
import { buildSnapshot } from "./run-snapshot.ts";
import { assertTransition, endStates } from "./run-transitions.ts";
import type { RunHost, RunPlan, StartRequest } from "./run-types.ts";
import { StateWaiters } from "./state-waiters.ts";

// 一次运行的“账”：状态、持有者、结果字段，以及状态变化和日志向外发的出口。
// 不碰进程；进程相关的事实（pid、是否较慢、日志的旁听者）由 RunSession 通过 `view` 提供。

export type RunRecordView = {
  pid(): number | undefined;
  slow(): boolean;
  /** 每一条日志（含系统提示）发出后调用，给就绪探测看输出 */
  onLog(entry: LogEntry): void;
};

export class RunRecord {
  state: RunState = "checking";
  owner: Owner;
  reason?: FailureReason;
  error?: RunyardError;
  exitCode?: number;
  endedAt?: number;
  readyMs?: number;
  plan?: RunPlan;
  stale = false;
  startedAt: number;
  readonly runId: string;
  readonly request: StartRequest;
  readonly host: RunHost;
  readonly view: RunRecordView;
  #logCount = 0;
  readonly #waiters = new StateWaiters();

  constructor(runId: string, request: StartRequest, host: RunHost, view: RunRecordView) {
    this.runId = runId;
    this.request = request;
    this.host = host;
    this.view = view;
    this.owner = request.owner;
    this.startedAt = host.deps.clock.now();
  }

  snapshot(): RunSnapshot {
    return buildSnapshot({
      runId: this.runId,
      request: this.request,
      state: this.state,
      owner: this.owner,
      reason: this.reason,
      stale: this.stale,
      slow: this.view.slow(),
      plan: this.plan,
      pid: this.view.pid(),
      exitCode: this.exitCode,
      startedAt: this.startedAt,
      readyMs: this.readyMs,
      endedAt: this.endedAt,
      logCount: this.#logCount,
      idleStopAt: this.host.deps.idleStopAt?.(this.runId, this.owner),
    });
  }

  waitFor(states: readonly RunState[]): Promise<RunSnapshot> {
    if (states.includes(this.state) || endStates.includes(this.state)) {
      return Promise.resolve(this.snapshot());
    }
    return this.#waiters.wait(states);
  }

  end(to: RunState, at: number = this.host.deps.clock.now()): void {
    this.endedAt = at;
    this.transition(to);
  }

  transition(to: RunState): void {
    assertTransition(this.request.kind, this.state, to);
    const previous = this.state;
    this.state = to;
    this.emitState(previous);
    const snapshot = this.snapshot();
    this.#waiters.notify(to, snapshot);
  }

  emitState(previous: RunState | undefined): void {
    this.host.deps.sinks.state({
      run: this.snapshot(),
      ...(previous === undefined ? {} : { previous }),
      at: this.host.deps.clock.now(),
      runningCount: this.host.runningCount(),
    });
  }

  log(notice: Notice): void {
    this.emitLog({ at: this.host.deps.clock.now(), kind: "system", notice });
  }

  emitLog(entry: LogEntry): void {
    this.#logCount += 1;
    this.host.deps.sinks.log(this.runId, entry);
    this.view.onLog(entry);
  }
}
