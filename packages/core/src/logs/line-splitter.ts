import type { LogEntry } from "@runyard/protocol";
import { decodeLogLine } from "./decode-log-line.ts";

export type ProcessStream = "stdout" | "stderr";

export type LineSplitter = {
  /** 收一块数据，返回这一块凑齐的整行；半行留在内部等下一块。 */
  push(chunk: Uint8Array): LogEntry[];
  /** 进程结束：把没有换行的残行作为最后一条返回，之后可以再用。 */
  end(): LogEntry[];
};

const LF = 0x0a;

// 每一路输出一个切行器：两路各自累积字节，半行互不串。
// 先按字节切行、整行凑齐后再解码，所以汉字或转义序列被拆在两块之间不会损坏。
// 只按 LF 切；行尾的 CR、颜色码、字节序标记原样保留，留给读取时清洗。
export function createLineSplitter(options: {
  stream: ProcessStream;
  now: () => number;
}): LineSplitter {
  const { stream, now } = options;
  let pending: Uint8Array = new Uint8Array(0);

  const entry = (bytes: Uint8Array): LogEntry => ({
    at: now(),
    kind: stream,
    text: decodeLogLine(bytes),
  });

  return {
    push(chunk) {
      const data = new Uint8Array(pending.length + chunk.length);
      data.set(pending, 0);
      data.set(chunk, pending.length);
      const entries: LogEntry[] = [];
      let start = 0;
      for (let i = data.indexOf(LF); i !== -1; i = data.indexOf(LF, start)) {
        entries.push(entry(data.subarray(start, i)));
        start = i + 1;
      }
      pending = data.slice(start);
      return entries;
    },
    end() {
      if (pending.length === 0) return [];
      const rest = pending;
      pending = new Uint8Array(0);
      return [entry(rest)];
    },
  };
}
