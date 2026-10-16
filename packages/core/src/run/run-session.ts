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
import { internalFailure, runFailedBeforeReady, scriptErrored } from "./run-failures.ts";
import type { Run, StdinOutcome } from "./run-handle.ts";
import { pumpOutput, type RunOutput } from "./run-output.ts";
import { buildSnapshot } from "./run-snapshot.ts";
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
import { StateWaiters } from "./state-waiters.ts";
import { PORT_RELEASE_LIMIT_MS, stopProcessTree } from "./stop-process-tree.ts";

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
  #stale = false;
  #slowTimer?: number;
  /** 重新加载时被换掉的旧进程：它的退出不是这次运行的退出 */
  readonly #replaced = new WeakSet<ManagedProcess>();
  readonly #lineListeners = new Set<(entry: LogEntry) => void>();
  #logCount = 0;
  #prepareAbort = new AbortController();
  #readyAbort = new AbortController();
  #preparing: Promise<void> = Promise.resolve();
  #stopping?: Promise<RunSnapshot>;
  readonly #waiters = new StateWaiters();

  readonly #waitFor: Promise<unknown>;
  #spawnError: unknown;

  /** `after`：同一个项目上一次运行正在停止时，等它停完再开始准备（所有者的决定，见 run-engine.ts） */
  constructor(runId: string, request: StartRequest, host: RunHost, after?: Promise<unknown>) {
    this.#waitFor = after ?? Promise.resolve();
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
    return buildSnapshot({
      runId: this.runId,
      request: this.request,
      state: this.#state,
      owner: this.#owner,
      reason: this.#reason,
      stale: this.#stale,
      slow: this.#slow,
      plan: this.#plan,
      pid: this.#proc?.ref.pid,
      exitCode: this.#exitCode,
      startedAt: this.#startedAt,
      readyMs: this.#readyMs,
      endedAt: this.#endedAt,
      logCount: this.#logCount,
    });
  }

  waitFor(states: readonly RunState[]): Promise<RunSnapshot> {
    if (states.includes(this.#state) || endStates.includes(this.#state)) {
      return Promise.resolve(this.snapshot());
    }
    return this.#waiters.wait(states);
  }

  /** 引擎登记之后调用一次：发出第一个状态，开始准备 */
  begin(): void {
    this.#emitState(undefined);
    this.#preparing = this.#waitFor.then(() => this.#prepareAndLaunch());
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

  writeStdin(data: string): Promise<StdinOutcome> {
    if (!isActiveState(this.#state) || this.#state === "stopping") return Promise.resolve("closed");
    const stream = this.#proc?.stdin;
    if (stream === null || stream === undefined) return Promise.resolve("unsupported");
    return new Promise((resolve) => {
      // 写入失败（进程刚好退出，管道已断）等于运行已经结束
      stream.write(data, (error) => resolve(error ? "closed" : "written"));
    });
  }

  markStale(checkOutput: readonly LogEntry[]): void {
    for (const entry of checkOutput) this.#emitLog(entry);
    this.#stale = true;
    // 状态没变，只是快照多了 stale：客户端靠这条事件知道要刷新
    this.#emitState(this.#state);
  }

  async reload(): Promise<void> {
    const plan = this.#plan;
    const old = this.#proc;
    if (this.#state !== "ready" || plan === undefined || old === undefined) return;
    this.beginReload();
    this.#replaced.add(old);
    await stopProcessTree(
      this.#host.deps.platform,
      this.#host.deps.clock,
      old.ref,
      plan.stop,
      plan.port,
      { name: RUN_MARKER_VAR, value: this.runId },
    );
    await old.exited;
    await this.#output?.finish();
    // 重新加载期间被停止：停止流程负责收尾，不再起新进程
    if (this.state !== "reloading") return;
    if (!this.#spawn(plan)) {
      this.#proc = undefined;
      await this.#finishFailed(internalFailure(this.request.name, this.#spawnError));
      return;
    }
    this.#awaitReady(plan, "reloading");
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
      outcome = { ok: false, failure: internalFailure(this.request.name, error) };
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
    this.#announcePortFallback(plan);
    const kind = this.request.kind;
    if (kind === "static") return this.#launchStatic(plan);
    if (!this.#spawn(plan)) {
      await this.#finishFailed(internalFailure(this.request.name, this.#spawnError));
      return;
    }
    if (kind === "oneshot") {
      this.#transition("running");
      return;
    }
    this.#enterStarting(plan);
  }

  #announcePortFallback({ portFallback, port }: RunPlan): void {
    if (portFallback === undefined || port === undefined) return;
    this.#host.deps.sinks.port?.({
      runId: this.runId,
      wanted: portFallback.wanted,
      actual: port,
      reason: portFallback.reason,
      ...(portFallback.occupant === undefined ? {} : { occupant: portFallback.occupant }),
    });
  }

  /** 起进程并接上输出和退出的处理；失败时把原因留在 #spawnError 并返回 false */
  #spawn(plan: RunPlan): boolean {
    let proc: ManagedProcess;
    try {
      proc = this.#host.deps.platform.exec.spawn({
        argv: [...plan.argv],
        cwd: plan.cwd,
        env: childEnv(plan.env, this.runId),
        stdin: plan.stdin,
      });
    } catch (error) {
      this.#spawnError = error;
      return false;
    }
    this.#proc = proc;
    this.#output = pumpOutput(proc, {
      now: () => this.#host.deps.clock.now(),
      emit: (entry) => this.#emitLog(entry),
    });
    // 退出的时刻在这里取：后面的收尾要让出几轮事件循环，不能让它们拖长耗时
    void proc.exited.then((info) => this.#onExit(proc, info.exitCode, this.#host.deps.clock.now()));
    return true;
  }

  // 先监听、再进 starting：静态页面没有就绪探测，进了 starting 就立刻 ready，
  // 那时端口必须已经能连上（规格 TEMPLATES-RUNNERS-08）
  async #launchStatic(plan: RunPlan): Promise<void> {
    try {
      const served = await plan.serve?.();
      if (served !== undefined) this.#served = served;
    } catch (error) {
      await this.#finishFailed(internalFailure(this.request.name, error));
      return;
    }
    if (this.#state === "stopping") return; // 停止流程会释放页面服务
    this.#enterStarting(plan);
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
    this.#awaitReady(plan, "starting");
  }

  /** 就绪探测；只有运行还停在 `from`（starting 或重新加载时的 reloading）才算数 */
  #awaitReady(plan: RunPlan, from: "starting" | "reloading"): void {
    void this.#host.deps.readiness
      .waitReady({
        runId: this.runId,
        plan,
        signal: this.#readyAbort.signal,
        onLine: (listener) => {
          this.#lineListeners.add(listener);
          return () => void this.#lineListeners.delete(listener);
        },
      })
      .then(() => {
        if (this.#state !== from) return;
        this.#clearSlowTimer();
        if (from === "starting") this.#readyMs = this.#host.deps.clock.now() - this.#startedAt;
        this.#transition("ready");
      });
  }

  // ---- 进程自己退出 ----

  async #onExit(proc: ManagedProcess, exitCode: number | null, exitedAt: number): Promise<void> {
    if (this.#replaced.has(proc)) return; // 重新加载时换下来的旧进程
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
        this.#error = scriptErrored(this.request.name, cause);
        this.#end("errored", exitedAt);
      }
    } else if (state === "starting") {
      // 启动阶段的输出也按运行器登记的特征归类（如缺运行库），归不了就是 RUN_FAILED
      const failure =
        this.#plan?.startupFailure?.(cause) ?? runFailedBeforeReady(this.request.name, cause);
      await this.#finishFailed(failure, exitedAt);
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
    this.#waiters.notify(to, snapshot);
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
    for (const listener of this.#lineListeners) listener(entry);
  }

  #clearSlowTimer(): void {
    if (this.#slowTimer === undefined) return;
    this.#host.deps.clock.clearTimeout(this.#slowTimer);
    this.#slowTimer = undefined;
  }
}
