import type { LogEntry, Owner, RunSnapshot, RunState, RunyardError } from "@runyard/protocol";
import type { StartRequest } from "./run-types.ts";

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
  /**
   * `watch.mode = restart` 的服务：ready 时停掉进程、用同一个计划（同一个端口）再起、等再次就绪。
   * 期间状态是 reloading，运行 id 不变；不在 ready 时什么也不做
   */
  reload(): Promise<void>;
  /** 脚本语法检查没过：保留这次运行的一切，标 stale，把检查的输出追加进它的日志 */
  markStale(checkOutput: readonly LogEntry[]): void;
};
