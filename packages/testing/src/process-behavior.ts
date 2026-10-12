import type { AbsPath, Env, ProcRef } from "@runyard/platform";

/** 在进程启动后 atMs 毫秒（假时间）往 stdout 或 stderr 写一块 */
export interface ScriptedOutput {
  readonly atMs: number;
  readonly stream: "stdout" | "stderr";
  readonly data: string | Uint8Array;
}

/** 进程启动后 atMs 毫秒起一个子进程；子进程的输出写进根进程的管道 */
export interface ChildSpec {
  readonly atMs: number;
  readonly behavior?: ProcessBehavior;
  /** 脱离根进程所在的进程树：停止整棵树时不会碰它（对应“脱离进程组的后代”） */
  readonly detached?: boolean;
  /** 持有输出管道的写端：根进程退出后，只要它还活着，根进程的输出流就不关闭 */
  readonly holdsOutputPipe?: boolean;
}

/**
 * 假进程的剧本。每个时间都是“进程启动之后”的假时间，由假时钟推进；
 * 什么都不写就是一个一直运行、直到被停止的进程。
 */
export interface ProcessBehavior {
  readonly output?: readonly ScriptedOutput[];
  /** 启动后 atMs 毫秒“就绪”：占住这个端口。端口已被占用时进程在 stderr 写一行并以 1 退出 */
  readonly listenOn?: { readonly port: number; readonly atMs: number };
  /** 启动后 afterMs 毫秒自己退出；不写就不会自己退出 */
  readonly exit?: { readonly afterMs: number; readonly code: number | null };
  /** 忽略礼貌的停止请求（graceful、interrupt），只有 kill 能结束它 */
  readonly ignoresStop?: boolean;
  /** 收到礼貌的停止请求后，过多久退出；默认 0（立刻） */
  readonly stopDelayMs?: number;
  /** 响应礼貌的停止请求而退出时的退出码；默认 0 */
  readonly stopExitCode?: number | null;
  /** 进程结束后，它占的端口过多久才真的空出来；默认 0（立刻） */
  readonly portReleaseDelayMs?: number;
  readonly children?: readonly ChildSpec[];
}

export interface SpawnSpec {
  readonly argv: readonly string[];
  readonly cwd: AbsPath;
  readonly env: Env;
}

/** 数组：argv 与之完全相等；函数：自己判断 */
export type ProcessMatcher = readonly string[] | ((spec: SpawnSpec) => boolean);

/** 剧本可以按启动参数现算（如按工作目录给不同的版本号） */
export type BehaviorSource = ProcessBehavior | ((spec: SpawnSpec) => ProcessBehavior);

/** 每次 spawn 或 spawnDetached 留下的记录，用来断言“启动了什么、怎么启动的” */
export interface SpawnRecord {
  readonly ref: ProcRef;
  readonly argv: readonly string[];
  readonly cwd: AbsPath;
  readonly env: Env;
  readonly stdin: boolean;
  /** 经 spawnDetached 启动的，输出写进这个日志文件 */
  readonly logFile: AbsPath | null;
  /** 写进 stdin 的全部内容 */
  stdinText(): string;
}
