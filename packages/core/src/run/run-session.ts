import type { Disposable, ManagedProcess } from "@runyard/platform";
import type {
  ErrorCause,
  FailureReason,
  LogEntry,
  Notice,
  Owner,
  RunSnapshot,
  RunState,
  RunyardError,
} from "@runyard/protocol";
import { childEnv, RUN_MARKER_VAR } from "./child-env.ts";
import { pumpOutput, type RunOutput } from "./run-output.ts";
import {
  assertTransition,
  endStates,
  IllegalTransitionError,
  isActiveState,
} from "./run-transitions.ts";
import {
  DEFAULT_SLOW_AFTER_MS,
  type PrepareOutcome,
  type RunHost,
  type RunPlan,
  type StartRequest,
} from "./run-types.ts";
import { PORT_RELEASE_LIMIT_MS, stopProcessTree } from "./stop-process-tree.ts";

/** 对外的一次运行。查询、等待、停止；持有者只是一个可以改的字段，引擎不解释它 */
export type Run = {
  readonly runId: string;
  readonly request: StartRequest;
  readonly state: RunState;
  snapshot(): RunSnapshot;
  /** 进入 failed 或 errored 时的完整错误（码、参数、现场）；其余状态没有 */
  error(): RunyardError | undefined;
  /** starting 已超过 slowAfterMs。状态不变，界面可以另加“较慢”字样 */
  isSlow(): boolean;
  setOwner(owner: Owner): void;
  /** 到达 states 之一，或者运行已经结束（不会再变）时返回当时的快照 */
  waitFor(states: readonly RunState[]): Promise<RunSnapshot>;
  /** 对已经结束的运行原样返回；停止中再停止返回同一个结果 */
  stop(): Promise<RunSnapshot>;
  /** 接缝：由应用负责重启的服务在保存文件时用（ready ⇄ reloading），驱动者是 supervisor */
  beginReload(): void;
  endReload(): void;
};

type Waiter = { states: readonly RunState[]; resolve: (snapshot: RunSnapshot) => void };

export class RunSession implements Run {
  readonly runId: string;
  readonly request: StartRequest;
  readonly #host: RunHost;
  readonly #startedAt: number;
  #state: RunState = "checking";
  #owner: Owner;
  #reason?: FailureReason;
  #error?: RunyardError;
  #exitCode?: number;
  #endedAt?: number;
  #readyMs?: number;
  #plan?: RunPlan;
  #proc?: ManagedProcess;
  #output?: RunOutput;
  #served?: Disposable;
  #slow = false;
  #slowTimer?: number;
  #logCount = 0;
  #prepareAbort = new AbortController();
  #readyAbort = new AbortController();
  #preparing: Promise<void> = Promise.resolve();
  #stopping?: Promise<RunSnapshot>;
  #waiters: Waiter[] = [];

  constructor(runId: string, request: StartRequest, host: RunHost) {
    this.runId = runId;
    this.request = request;
    this.#owner = request.owner;
    this.#host = host;
    this.#startedAt = host.deps.clock.now();
  }

  get state(): RunState {
    return this.#state;
  }

  /** 端口（计划里的）；重启时沿用 */
  get port(): number | undefined {
    return this.#plan?.port;
  }

  get owner(): Owner {
    return this.#owner;
  }

  setOwner(owner: Owner): void {
    this.#owner = owner;
  }

  isSlow(): boolean {
    return this.#slow;
  }

  error(): RunyardError | undefined {
    return this.#error;
  }

  snapshot(): RunSnapshot {
    const plan = this.#plan;
    return {
      runId: this.runId,
      playgroundId: this.request.playgroundId,
      name: this.request.name,
      kind: this.request.kind,
      state: this.#state,
      ...(this.#reason === undefined ? {} : { reason: this.#reason }),
      owner: this.#owner,
      ...(this.#slow ? { slow: true } : {}),
      ...(plan?.port === undefined ? {} : { port: plan.port }),
      ...(plan?.url === undefined ? {} : { url: plan.url }),
      ...(plan?.portFallback === undefined ? {} : { portFallback: plan.portFallback }),
      ...(this.#proc === undefined ? {} : { pid: this.#proc.ref.pid }),
      ...(this.#exitCode === undefined ? {} : { exitCode: this.#exitCode }),
      startedAt: this.#startedAt,
      ...(this.#readyMs === undefined ? {} : { readyMs: this.#readyMs }),
      ...(this.#endedAt === undefined ? {} : { durationMs: this.#endedAt - this.#startedAt }),
      cursor: `${this.runId}:${this.#logCount}`,
    };
  }

  waitFor(states: readonly RunState[]): Promise<RunSnapshot> {
    if (states.includes(this.#state) || endStates.includes(this.#state)) {
      return Promise.resolve(this.snapshot());
    }
    return new Promise((resolve) => this.#waiters.push({ states, resolve }));
  }

  /** 引擎登记之后调用一次：发出第一个状态，开始准备 */
  begin(): void {
    this.#emitState(undefined);
    this.#preparing = this.#prepareAndLaunch();
  }

  stop(): Promise<RunSnapshot> {
    if (this.#stopping !== undefined) return this.#stopping;
    if (!isActiveState(this.#state)) return Promise.resolve(this.snapshot());
    this.#stopping = this.#stopRun();
    return this.#stopping;
  }

  beginReload(): void {
    this.#transition("reloading");
    this.#log({ code: "RELOADING", params: {} });
  }

  endReload(): void {
    // 从 starting 回 ready 在表里是合法的，但那是就绪探测的事，不是重载结束
    if (this.#state !== "reloading") {
      throw new IllegalTransitionError(this.request.kind, this.#state, "ready");
    }
    this.#transition("ready");
  }

  // ---- 启动 ----

  async #prepareAndLaunch(): Promise<void> {
    let outcome: PrepareOutcome;
    try {
      outcome = await this.#host.deps.preparer.prepare({
        runId: this.runId,
        request: this.request,
        signal: this.#prepareAbort.signal,
        report: (state) => {
          if (this.#state === "checking") this.#transition(state);
        },
        log: (entry) => this.#emitLog(entry),
      });
    } catch (error) {
      outcome = { ok: false, failure: this.#internalFailure(error) };
    }
    if (this.#state === "stopping") {
      if (outcome.ok) await this.#removeTempDir(outcome.plan);
      return; // 停止流程会收尾
    }
    if (!outcome.ok) {
      await this.#finishFailed(outcome.failure);
      return;
    }
    await this.#launch(outcome.plan);
  }

  async #launch(plan: RunPlan): Promise<void> {
    this.#plan = plan;
    const kind = this.request.kind;
    if (kind === "static") return this.#launchStatic(plan);
    let proc: ManagedProcess;
    try {
      proc = this.#host.deps.platform.exec.spawn({
        argv: [...plan.argv],
        cwd: plan.cwd,
        env: childEnv(plan.env, this.runId),
        stdin: plan.stdin,
      });
    } catch (error) {
      await this.#finishFailed(this.#internalFailure(error));
      return;
    }
    this.#proc = proc;
    this.#output = pumpOutput(proc, {
      now: () => this.#host.deps.clock.now(),
      emit: (entry) => this.#emitLog(entry),
    });
    // 退出的时刻在这里取：后面的收尾要让出几轮事件循环，不能让它们拖长耗时
    void proc.exited.then((info) => this.#onExit(info.exitCode, this.#host.deps.clock.now()));
    if (kind === "oneshot") {
      this.#transition("running");
      return;
    }
    this.#enterStarting(plan);
  }

  async #launchStatic(plan: RunPlan): Promise<void> {
    this.#enterStarting(plan);
    try {
      const served = await plan.serve?.();
      if (served !== undefined) this.#served = served;
    } catch (error) {
      await this.#finishFailed(this.#internalFailure(error));
    }
  }

  #enterStarting(plan: RunPlan): void {
    this.#transition("starting");
    const slowAfter = plan.slowAfterMs ?? DEFAULT_SLOW_AFTER_MS;
    const clock = this.#host.deps.clock;
    this.#slowTimer = clock.setTimeout(() => {
      this.#slowTimer = undefined;
      if (this.#state !== "starting") return;
      this.#slow = true;
      this.#host.deps.sinks.slow?.(this.snapshot());
    }, slowAfter);
    void this.#host.deps.readiness
      .waitReady({ runId: this.runId, plan, signal: this.#readyAbort.signal })
      .then(() => {
        if (this.#state !== "starting") return;
        this.#clearSlowTimer();
        this.#readyMs = this.#host.deps.clock.now() - this.#startedAt;
        this.#transition("ready");
      });
  }

  // ---- 进程自己退出 ----

  async #onExit(exitCode: number | null, exitedAt: number): Promise<void> {
    await this.#output?.finish();
    if (this.#state === "stopping" || !isActiveState(this.#state)) return; // 停止流程在管
    this.#clearSlowTimer();
    this.#readyAbort.abort();
    if (exitCode !== null) this.#exitCode = exitCode;
    this.#log({
      code: "PROCESS_EXITED",
      params: exitCode === null ? {} : { exitCode },
    });
    await this.#sweepTree();
    const cause: ErrorCause = {
      ...(exitCode === null ? {} : { exitCode }),
      outputTail: this.#output?.tail() ?? "",
    };
    const state = this.#state;
    if (state === "running") {
      if (exitCode === 0) this.#end("finished", exitedAt);
      else {
        this.#error = {
          code: "SCRIPT_ERRORED",
          params: { name: this.request.name },
          debug: "script exited with a non-zero code",
          cause,
        };
        this.#end("errored", exitedAt);
      }
    } else if (state === "starting") {
      await this.#finishFailed(
        {
          code: "RUN_FAILED",
          params: { name: this.request.name },
          debug: "process exited before it was ready",
          cause,
        },
        exitedAt,
      );
      return;
    } else {
      this.#end("crashed", exitedAt); // ready、reloading：不自动重启
    }
    await this.#cleanup();
    this.#host.deps.sinks.exit?.({ runId: this.runId, ...this.#exitFields() });
  }

  // 根进程退出后，树里可能还有活着的后代：整棵结束
  async #sweepTree(): Promise<void> {
    const proc = this.#proc;
    if (proc === undefined) return;
    const platform = this.#host.deps.platform;
    if ((await platform.proc.members(proc.ref)).length > 0) {
      await platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
    }
  }

  // ---- 失败与结束 ----

  async #finishFailed(failure: RunyardError<FailureReason>, at?: number): Promise<void> {
    this.#clearSlowTimer();
    this.#readyAbort.abort();
    this.#reason = failure.code;
    this.#error = failure;
    this.#end("failed", at);
    await this.#cleanup();
    this.#host.deps.sinks.exit?.({ runId: this.runId, reason: failure.code });
  }

  #internalFailure(error: unknown): RunyardError<FailureReason> {
    return {
      code: "RUN_FAILED",
      params: { name: this.request.name },
      debug: `run could not be started: ${String(error)}`,
    };
  }

  #exitFields(): { exitCode?: number } {
    return this.#exitCode === undefined ? {} : { exitCode: this.#exitCode };
  }

  async #cleanup(): Promise<void> {
    await this.#served?.dispose();
    this.#served = undefined;
    if (this.#plan !== undefined) await this.#removeTempDir(this.#plan);
  }

  async #removeTempDir(plan: RunPlan): Promise<void> {
    if (plan.tempDir !== undefined) await this.#host.deps.removeDir(plan.tempDir);
  }

  // ---- 停止 ----

  async #stopRun(): Promise<RunSnapshot> {
    this.#transition("stopping");
    this.#clearSlowTimer();
    this.#prepareAbort.abort();
    this.#readyAbort.abort();
    this.#log({ code: "STOPPED_BY_USER", params: {} });
    await this.#preparing;
    const proc = this.#proc;
    if (proc !== undefined && this.#plan !== undefined) {
      const outcome = await stopProcessTree(
        this.#host.deps.platform,
        this.#host.deps.clock,
        proc.ref,
        this.#plan.stop,
        this.#plan.port,
        { name: RUN_MARKER_VAR, value: this.runId },
      );
      // stop 照常返回，但要让客户端知道端口还没空出来（下次启动若仍被占用会按回退规则换端口）
      if (!outcome.portReleased && this.#plan.port !== undefined) {
        this.#log({
          code: "PORT_NOT_RELEASED",
          params: {
            port: this.#plan.port,
            waitedMs: Math.round(outcome.portWaitedMs),
            limitMs: PORT_RELEASE_LIMIT_MS,
          },
        });
      }
      const info = await proc.exited;
      if (info.exitCode !== null) this.#exitCode = info.exitCode;
      await this.#output?.finish();
    }
    await this.#cleanup();
    this.#end("stopped");
    this.#host.deps.sinks.exit?.({ runId: this.runId, ...this.#exitFields() });
    return this.snapshot();
  }

  // ---- 状态与事件 ----

  #end(to: RunState, at: number = this.#host.deps.clock.now()): void {
    this.#endedAt = at;
    this.#transition(to);
  }

  #transition(to: RunState): void {
    assertTransition(this.request.kind, this.#state, to);
    const previous = this.#state;
    this.#state = to;
    this.#emitState(previous);
    const snapshot = this.snapshot();
    const ready = this.#waiters.filter(
      (waiter) => waiter.states.includes(to) || endStates.includes(to),
    );
    this.#waiters = this.#waiters.filter((waiter) => !ready.includes(waiter));
    for (const waiter of ready) waiter.resolve(snapshot);
  }

  #emitState(previous: RunState | undefined): void {
    this.#host.deps.sinks.state({
      run: this.snapshot(),
      ...(previous === undefined ? {} : { previous }),
      at: this.#host.deps.clock.now(),
      runningCount: this.#host.runningCount(),
    });
  }

  #log(notice: Notice): void {
    this.#emitLog({ at: this.#host.deps.clock.now(), kind: "system", notice });
  }

  #emitLog(entry: LogEntry): void {
    this.#logCount += 1;
    this.#host.deps.sinks.log(this.runId, entry);
  }

  #clearSlowTimer(): void {
    if (this.#slowTimer === undefined) return;
    this.#host.deps.clock.clearTimeout(this.#slowTimer);
    this.#slowTimer = undefined;
  }
}
