import type { ManagedProcess } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import { cleanLogText } from "../logs/clean-log-text.ts";
import { createLineSplitter } from "../logs/line-splitter.ts";

// 把一个进程的 stdout、stderr 切成日志条目，并留下末尾几行给失败原因用（cause.outputTail）。
// 两路各一个切行器，半行互不串；进程退出后收下管道里已有的数据、交出残行，再销毁管道，
// 所以后代拿着写端不放也不会卡住（规格 RUN-LIFECYCLE-16）。

const TAIL_LINES = 20;

export type RunOutput = {
  /** 进程已退出：收尾、交出残行、销毁管道 */
  finish(): Promise<void>;
  tail(): string;
};

// 让已经排队的流事件跑完：不是等待时间，只让出事件循环
const yieldLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export function pumpOutput(
  proc: ManagedProcess,
  options: { now: () => number; emit: (entry: LogEntry) => void },
): RunOutput {
  const lines: string[] = [];
  const handle = (entries: LogEntry[]) => {
    for (const entry of entries) {
      options.emit(entry);
      if (entry.kind === "stdout" || entry.kind === "stderr") {
        const cleaned = cleanLogText(entry.text);
        if (cleaned !== null) lines.push(cleaned);
        if (lines.length > TAIL_LINES) lines.shift();
      }
    }
  };
  const sources = [
    { stream: proc.stdout, splitter: createLineSplitter({ stream: "stdout", now: options.now }) },
    { stream: proc.stderr, splitter: createLineSplitter({ stream: "stderr", now: options.now }) },
  ];
  for (const { stream, splitter } of sources) {
    stream.on("data", (chunk: Uint8Array | string) => {
      handle(splitter.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    });
    stream.on("error", () => undefined); // 管道被销毁时的错误不是运行的错误
  }
  return {
    async finish() {
      await yieldLoop();
      await yieldLoop();
      for (const { stream, splitter } of sources) {
        handle(splitter.end());
        stream.destroy();
      }
    },
    tail: () => lines.join("\n"),
  };
}
