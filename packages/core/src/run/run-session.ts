import type { Disposable, ManagedProcess } from "@runyard/platform";
import type {
  ErrorCause,
  FailureReason,
  LogEntry,
  Owner,
  RunSnapshot,
  RunState,
  RunyardError,
} from "@runyard/protocol";
import { RUN_MARKER_VAR } from "./child-env.ts";
import { internalFailure, runFailedBeforeReady, scriptErrored } from "./run-failures.ts";
import type { Run, StdinOutcome } from "./run-handle.ts";
import { pumpOutput, type RunOutput } from "./run-output.ts";
import { RunRecord } from "./run-record.ts";
import {
  announcePortFallback,
  prepareRun,
  spawnRunProcess,
  stopRunProcess,
  sweepTree,
} from "./run-session-steps.ts";
import { IllegalTransitionError, isActiveState } from "./run-transitions.ts";
import {
  type CrashedRunInput,
  DEFAULT_SLOW_AFTER_MS,
  type RunHost,
  type RunPlan,
  type StartRequest,
  type StopOptions,
} from "./run-types.ts";
import { StartupWatch } from "./startup-watch.ts";
import { stopProcessTree } from "./stop-process-tree.ts";

export class RunSession implements Run {
  readonly runId: string;
  readonly request: StartRequest;
  readonly #host: RunHost;
  readonly #rec: RunRecord;
  #proc?: ManagedProcess;
  #output?: RunOutput;
  #served?: Disposable;
  /** 重新加载时被换掉的旧进程：它的退出不是这次运行的退出 */
  readonly #replaced = new WeakSet<ManagedProcess>();
  readonly #watch: StartupWatch;
  #prepareAbort = new AbortController();
  #preparing: Promise<void> = Promise.resolve();
  #stopping?: Promise<RunSnapshot>;

  readonly #waitFor: Promise<unknown>;
  #spawnError: unknown;
  /** 崩溃后恢复出来的记录没有进程对象，只有当时的 pid */
  #restoredPid?: number;

  /** `after`：同一个项目上一次运行正在停止时，等它停完再开始准备（所有者的决定，见 run-engine.ts） */
  constructor(runId: string, request: StartRequest, host: RunHost, after?: Promise<unknown>) {
    this.#waitFor = after ?? Promise.resolve();
    this.runId = runId;
    this.request = request;
    this.#host = host;
    this.#watch = new StartupWatch({
      clock: host.deps.clock,
      readiness: host.deps.readiness,
      runId,
    });
    this.#rec = new RunRecord(runId, request, host, {
      pid: () => this.#proc?.ref.pid ?? this.#restoredPid,
      slow: () => this.#watch.slow,
      onLog: (entry) => this.#watch.feed(entry),
    });
  }

  /**
   * 管理进程崩溃之后的清理（规格 SUPERVISOR-LIFECYCLE-16、17）：上次的运行只剩一条记录，
   * 在引擎里留一个 `crashed` 的运行，让 run.get、状态能说出它的结局。不会再变，也不持有任何进程
   */
  static restoreCrashed(host: RunHost, input: CrashedRunInput): RunSession {
    const session = new RunSession(input.runId, input.request, host);
    session.#restoredPid = input.pid;
    const rec = session.#rec;
    rec.plan = input.plan;
    rec.startedAt = input.startedAt;
    rec.endedAt = input.endedAt;
    rec.state = "crashed";
    return session;
  }

  get state(): RunState {
    return this.#rec.state;
  }

  /** 端口（计划里的）；重启时沿用 */
  get port(): number | undefined {
    return this.#rec.plan?.port;
  }

  get owner(): Owner {
    return this.#rec.owner;
  }

  setOwner(owner: Owner): void {
    this.#rec.owner = owner;
  }

  isSlow(): boolean {
    return this.#watch.slow;
  }

  error(): RunyardError | undefined {
    return this.#rec.error;
  }

  snapshot(): RunSnapshot {
    return this.#rec.snapshot();
  }

  waitFor(states: readonly RunState[]): Promise<RunSnapshot> {
    return this.#rec.waitFor(states);
  }

  /** 引擎登记之后调用一次：发出第一个状态，开始准备 */
  begin(): void {
    this.#rec.emitState(undefined);
    this.#preparing = this.#waitFor.then(() => this.#prepareAndLaunch());
  }

  stop(options: StopOptions = {}): Promise<RunSnapshot> {
    if (this.#stopping !== undefined) return this.#stopping;
    if (!isActiveState(this.#rec.state)) return Promise.resolve(this.snapshot());
    this.#stopping = this.#stopRun(options);
    return this.#stopping;
  }

  beginReload(): void {
    this.#rec.transition("reloading");
    this.#rec.log({ code: "RELOADING", params: {} });
  }

  endReload(): void {
    // 从 starting 回 ready 在表里是合法的，但那是就绪探测的事，不是重载结束
    if (this.#rec.state !== "reloading") {
      throw new IllegalTransitionError(this.request.kind, this.#rec.state, "ready");
    }
    this.#rec.transition("ready");
  }

  writeStdin(data: string): Promise<StdinOutcome> {
    if (!isActiveState(this.#rec.state) || this.#rec.state === "stopping")
      return Promise.resolve("closed");
    const stream = this.#proc?.stdin;
    if (stream === null || stream === undefined) return Promise.resolve("unsupported");
    return new Promise((resolve) => {
      // 写入失败（进程刚好退出，管道已断）等于运行已经结束
      stream.write(data, (error) => resolve(error ? "closed" : "written"));
    });
  }

  markStale(checkOutput: readonly LogEntry[]): void {
    for (const entry of checkOutput) this.#rec.emitLog(entry);
    this.#rec.stale = true;
    // 状态没变，只是快照多了 stale：客户端靠这条事件知道要刷新
    this.#rec.emitState(this.#rec.state);
  }

  async reload(): Promise<void> {
    const plan = this.#rec.plan;
    const old = this.#proc;
    if (this.#rec.state !== "ready" || plan === undefined || old === undefined) return;
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
    const outcome = await prepareRun(this.#host.deps.preparer, {
      runId: this.runId,
      request: this.request,
      signal: this.#prepareAbort.signal,
      report: (state) => {
        if (this.#rec.state === "checking") this.#rec.transition(state);
      },
      log: (entry) => this.#rec.emitLog(entry),
    });
    if (this.#rec.state === "stopping") {
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
    this.#rec.plan = plan;
    announcePortFallback(this.#host.deps.sinks, this.runId, plan);
    const kind = this.request.kind;
    if (kind === "static") return this.#launchStatic(plan);
    if (!this.#spawn(plan)) {
      await this.#finishFailed(internalFailure(this.request.name, this.#spawnError));
      return;
    }
    if (kind === "oneshot") {
      this.#rec.transition("running");
      return;
    }
    this.#enterStarting(plan);
  }

  /** 起进程并接上输出和退出的处理；失败时把原因留在 #spawnError 并返回 false */
  #spawn(plan: RunPlan): boolean {
    const spawned = spawnRunProcess(this.#host.deps.platform, this.runId, plan);
    if (!spawned.ok) {
      this.#spawnError = spawned.error;
      return false;
    }
    const proc = spawned.proc;
    this.#proc = proc;
    this.#host.deps.sinks.spawned?.({
      runId: this.runId,
      request: this.request,
      owner: this.#rec.owner,
      ref: proc.ref,
      plan,
      state: this.#rec.state,
      startedAt: this.#rec.startedAt,
    });
    this.#output = pumpOutput(proc, {
      now: () => this.#host.deps.clock.now(),
      emit: (entry) => this.#rec.emitLog(entry),
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
    if (this.#rec.state === "stopping") return; // 停止流程会释放页面服务
    this.#enterStarting(plan);
  }

  #enterStarting(plan: RunPlan): void {
    this.#rec.transition("starting");
    const slowAfter = plan.slowAfterMs ?? DEFAULT_SLOW_AFTER_MS;
    this.#watch.startSlowTimer(
      slowAfter,
      () => this.#rec.state === "starting",
      () => this.#host.deps.sinks.slow?.(this.snapshot()),
    );
    this.#awaitReady(plan, "starting");
  }

  /** 就绪探测；只有运行还停在 `from`（starting 或重新加载时的 reloading）才算数 */
  #awaitReady(plan: RunPlan, from: "starting" | "reloading"): void {
    this.#watch.awaitReady(plan, () => {
      if (this.#rec.state !== from) return;
      this.#watch.clearSlowTimer();
      if (from === "starting")
        this.#rec.readyMs = this.#host.deps.clock.now() - this.#rec.startedAt;
      this.#rec.transition("ready");
    });
  }

  // ---- 进程自己退出 ----

  async #onExit(proc: ManagedProcess, exitCode: number | null, exitedAt: number): Promise<void> {
    if (this.#replaced.has(proc)) return; // 重新加载时换下来的旧进程
    await this.#output?.finish();
    if (this.#rec.state === "stopping" || !isActiveState(this.#rec.state)) return; // 停止流程在管
    this.#watch.clearSlowTimer();
    this.#watch.abortReadiness();
    if (exitCode !== null) this.#rec.exitCode = exitCode;
    this.#rec.log({
      code: "PROCESS_EXITED",
      params: exitCode === null ? {} : { exitCode },
    });
    await this.#sweepTree();
    const cause: ErrorCause = {
      ...(exitCode === null ? {} : { exitCode }),
      outputTail: this.#output?.tail() ?? "",
    };
    const state = this.#rec.state;
    if (state === "running") {
      if (exitCode === 0) this.#rec.end("finished", exitedAt);
      else {
        this.#rec.error = scriptErrored(this.request.name, cause);
        this.#rec.end("errored", exitedAt);
      }
    } else if (state === "starting") {
      // 启动阶段的输出也按运行器登记的特征归类（如缺运行库），归不了就是 RUN_FAILED
      const failure =
        this.#rec.plan?.startupFailure?.(cause) ?? runFailedBeforeReady(this.request.name, cause);
      await this.#finishFailed(failure, exitedAt);
      return;
    } else {
      this.#rec.end("crashed", exitedAt); // ready、reloading：不自动重启
    }
    await this.#cleanup();
    this.#host.deps.sinks.exit?.({ runId: this.runId, ...this.#exitFields() });
  }

  // 根进程退出后，树里可能还有活着的后代：整棵结束
  async #sweepTree(): Promise<void> {
    if (this.#proc !== undefined) await sweepTree(this.#host.deps.platform, this.#proc);
  }

  // ---- 失败与结束 ----

  async #finishFailed(failure: RunyardError<FailureReason>, at?: number): Promise<void> {
    this.#watch.clearSlowTimer();
    this.#watch.abortReadiness();
    this.#rec.reason = failure.code;
    this.#rec.error = failure;
    this.#rec.end("failed", at);
    await this.#cleanup();
    this.#host.deps.sinks.exit?.({ runId: this.runId, reason: failure.code });
  }

  #exitFields(): { exitCode?: number } {
    return this.#rec.exitCode === undefined ? {} : { exitCode: this.#rec.exitCode };
  }

  async #cleanup(): Promise<void> {
    await this.#served?.dispose();
    this.#served = undefined;
    if (this.#rec.plan !== undefined) await this.#removeTempDir(this.#rec.plan);
  }

  async #removeTempDir(plan: RunPlan): Promise<void> {
    if (plan.tempDir !== undefined) await this.#host.deps.removeDir(plan.tempDir);
  }

  // ---- 停止 ----

  async #stopRun({ idle }: StopOptions): Promise<RunSnapshot> {
    this.#rec.transition("stopping");
    this.#watch.clearSlowTimer();
    this.#prepareAbort.abort();
    this.#watch.abortReadiness();
    this.#rec.log(
      idle === undefined
        ? { code: "STOPPED_BY_USER", params: {} }
        : { code: "IDLE_STOPPED", params: { minutes: idle.minutes } },
    );
    await this.#preparing;
    const proc = this.#proc;
    if (proc !== undefined && this.#rec.plan !== undefined) {
      const exitCode = await stopRunProcess({
        platform: this.#host.deps.platform,
        clock: this.#host.deps.clock,
        runId: this.runId,
        proc,
        plan: this.#rec.plan,
        log: (notice) => this.#rec.log(notice),
      });
      if (exitCode !== null) this.#rec.exitCode = exitCode;
      await this.#output?.finish();
    }
    await this.#cleanup();
    this.#rec.end("stopped");
    this.#host.deps.sinks.exit?.({
      runId: this.runId,
      ...(idle === undefined ? {} : { reason: "idle" as const }),
      ...this.#exitFields(),
    });
    return this.snapshot();
  }
}
