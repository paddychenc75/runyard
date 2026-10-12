import type { AbsPath, Disposable, Env, Platform } from "@runyard/platform";
import type {
  EventData,
  FailureReason,
  LogEntry,
  Owner,
  PortFallback,
  RunKind,
  RunSnapshot,
  RunyardError,
} from "@runyard/protocol";
import type { RunClock } from "./run-clock.ts";

// 运行引擎的类型与接缝。引擎只管“一次运行的状态机和进程生命周期”；
// 下面标了“接缝”的四处由别的 issue 接上：准备（#36 的工具检查、安装、端口、环境）、
// 就绪探测（#36）、持有者（supervisor #40）、事件出口（supervisor）。

export type RunStopSpec = {
  /** `interrupt` 给 Go 的运行器；接口里没有信号名 */
  readonly mode: "graceful" | "interrupt";
  /** 缺省 2000（决策记录 0006） */
  readonly graceMs: number;
};

export const DEFAULT_GRACE_MS = 2000;
export const DEFAULT_SLOW_AFTER_MS = 30_000;

/** 启动请求：调用方（supervisor）已经知道项目和运行器种类 */
export type StartRequest = {
  readonly playgroundId: string;
  readonly name: string;
  readonly kind: RunKind;
  readonly owner: Owner;
  /** 只用于这一次的端口（RUN-PORTS-09），由准备阶段去处理 */
  readonly port?: number;
};

/** 准备阶段做完之后，引擎要启动的东西。argv 已经替换过占位符、第一个词已是真实路径 */
export type RunPlan = {
  readonly argv: readonly string[];
  readonly cwd: AbsPath;
  /** 完整的子进程环境；引擎再去掉 ELECTRON_RUN_AS_NODE 并加运行标记 */
  readonly env: Env;
  readonly stdin: boolean;
  readonly stop: RunStopSpec;
  /** 默认 30000。超过只标“较慢”，不算失败 */
  readonly slowAfterMs?: number;
  readonly port?: number;
  readonly url?: string;
  readonly portFallback?: PortFallback;
  /** Go 的单独临时目录（GOTMPDIR）：停止后删除 */
  readonly tempDir?: AbsPath;
  /** `static` 运行没有子进程：由管理进程托管，引擎只负责在停止时释放 */
  readonly serve?: () => Promise<Disposable>;
};

export type PrepareOutcome =
  | { readonly ok: true; readonly plan: RunPlan }
  | { readonly ok: false; readonly failure: RunyardError<FailureReason> };

/** 接缝：checking 与 installing 两个阶段（#36）。`report("installing")` 推进状态；`signal` 在停止时中止 */
export type PrepareContext = {
  readonly runId: string;
  readonly request: StartRequest;
  readonly signal: AbortSignal;
  report(state: "installing"): void;
  /** 准备阶段的输出（安装命令的输出等）进同一份日志 */
  log(entry: LogEntry): void;
};

export type RunPreparer = {
  prepare(context: PrepareContext): Promise<PrepareOutcome>;
};

/** 接缝：就绪探测（#36）。到就绪时 resolve；信号中止后可以一直不 resolve */
export type ReadinessContext = {
  readonly runId: string;
  readonly plan: RunPlan;
  readonly signal: AbortSignal;
};

export type ReadinessProbe = {
  waitReady(context: ReadinessContext): Promise<void>;
};

export type RunStateEvent = EventData<"run.state">;
export type RunExitEvent = EventData<"run.exit">;

/** 接缝：事件出口。supervisor 把它们接到订阅者和日志存储上 */
export type RunSinks = {
  state(event: RunStateEvent): void;
  log(runId: string, entry: LogEntry): void;
  exit?(event: RunExitEvent): void;
  /** starting 超过 slowAfterMs 仍未就绪：状态不变，只通知一次 */
  slow?(snapshot: RunSnapshot): void;
};

export type RunEngineDeps = {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly sinks: RunSinks;
  readonly preparer: RunPreparer;
  readonly readiness: ReadinessProbe;
  /** 删除 plan.tempDir。测试里换成内存实现 */
  readonly removeDir: (dir: AbsPath) => Promise<void>;
  /** 默认 `run-<序号>`；游标格式要求 id 不含冒号和空白 */
  readonly newRunId?: () => string;
};

/** 引擎内部给会话的宿主能力 */
export type RunHost = {
  readonly deps: RunEngineDeps;
  runningCount(): number;
};
