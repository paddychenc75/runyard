import type { LogEntry } from "@runyard/protocol";

/** 内存里每次运行最多留多少行、多少字节（先到为准；规格 RUN-LOGS-13） */
export const RING_MAX_LINES = 10_000;
export const RING_MAX_BYTES = 4 * 1024 * 1024;

export interface LoggedLine {
  readonly seq: number;
  readonly entry: LogEntry;
  /** 这一行在磁盘上占的字节数（含换行），内存上限也按它算 */
  readonly bytes: number;
}

// 一次运行的内存环形缓冲。序号从 1 开始、只增不减：掐掉旧行或清空之后也不重排，游标因此一直有效。
export class RunLogRing {
  readonly #maxLines: number;
  readonly #maxBytes: number;
  #lines: LoggedLine[] = [];
  // 用起点下标代替 shift：一万行的数组每次 shift 都要搬一遍
  #start = 0;
  #bytes = 0;
  #lastSeq = 0;

  constructor(limits: { maxLines?: number; maxBytes?: number } = {}) {
    this.#maxLines = limits.maxLines ?? RING_MAX_LINES;
    this.#maxBytes = limits.maxBytes ?? RING_MAX_BYTES;
  }

  get lastSeq(): number {
    return this.#lastSeq;
  }

  /** 现存最早一行的序号；空的时候是 lastSeq + 1（“下一行”） */
  get firstSeq(): number {
    return this.#lines[this.#start]?.seq ?? this.#lastSeq + 1;
  }

  /** 给下一条日志的序号 */
  nextSeq(): number {
    return this.#lastSeq + 1;
  }

  push(line: LoggedLine): void {
    this.#lines.push(line);
    this.#bytes += line.bytes;
    this.#lastSeq = line.seq;
    // 最新的一行再大也要留着：只有一行时不再掐
    while (this.#size() > 1 && (this.#size() > this.#maxLines || this.#bytes > this.#maxBytes)) {
      const dropped = this.#lines[this.#start];
      this.#start += 1;
      this.#bytes -= dropped?.bytes ?? 0;
    }
    if (this.#start > 1024 && this.#start * 2 > this.#lines.length) {
      this.#lines = this.#lines.slice(this.#start);
      this.#start = 0;
    }
  }

  lines(): readonly LoggedLine[] {
    return this.#start === 0 ? this.#lines : this.#lines.slice(this.#start);
  }

  /** 清空内容，序号继续往后数 */
  clear(): void {
    this.#lines = [];
    this.#start = 0;
    this.#bytes = 0;
  }

  /** 从磁盘读回来的行重建：序号用文件里的，lastSeq 跟着最后一行 */
  load(lines: readonly LoggedLine[]): void {
    for (const line of lines) this.push(line);
  }

  #size(): number {
    return this.#lines.length - this.#start;
  }
}
