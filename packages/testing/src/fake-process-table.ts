import type { Env, ExitInfo, ProcRef } from "@runyard/platform";
import type { TimerId } from "./fake-clock.ts";
import type { ProcessBehavior } from "./process-behavior.ts";

// 假进程表里每个进程的记录（FakeProcesses 的内部状态，拆出来让主文件保持在行数上限之内）。

export interface Sink {
  write(stream: "stdout" | "stderr", data: Uint8Array): void;
  end(): void;
}

export interface Proc {
  readonly ref: ProcRef;
  readonly name: string;
  /** 环境：后代继承父进程的（脱离进程组的也一样），按标记找进程靠它 */
  readonly env: Env;
  readonly behavior: ProcessBehavior;
  readonly parent: Proc | null;
  readonly detached: boolean;
  readonly holdsPipe: boolean;
  readonly pipeRoot: Proc;
  readonly children: Proc[];
  readonly timers: TimerId[];
  readonly exitWaiters: ((info: ExitInfo) => void)[];
  sink: Sink | null;
  sinkEnded: boolean;
  alive: boolean;
  exitInfo: ExitInfo | null;
}
