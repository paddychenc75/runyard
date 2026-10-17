// 终端输出的回滚缓冲（规格 DESKTOP-TERMINAL-21）：只留最近 limit 行，更早的丢掉；
// 界面没显示终端时输出照常记在这里，再接上时整段回放（DESKTOP-TERMINAL-03、04）。
// 存的是原始输出（含颜色等控制序列），按换行数切，切在行与行之间，所以回放不会从一行中间开始。

/** 一整行都没有换行时的保险：超过这么多字符就从前面丢（不会正常出现，防止撑爆内存） */
const MAX_CHARS = 16 * 1024 * 1024;

export class OutputBuffer {
  readonly #limit: number;
  #chunks: string[] = [];
  /** 每块里的换行数，和 #chunks 一一对应 */
  #newlines: number[] = [];
  #lines = 0;
  #chars = 0;

  constructor(limitLines: number) {
    this.#limit = limitLines;
  }

  append(data: string): void {
    if (data === "") return;
    const count = countNewlines(data);
    this.#chunks.push(data);
    this.#newlines.push(count);
    this.#lines += count;
    this.#chars += data.length;
    this.#trim();
  }

  /** 记下的全部输出 */
  text(): string {
    if (this.#chunks.length > 1) {
      this.#chunks = [this.#chunks.join("")];
      this.#newlines = [this.#lines];
    }
    return this.#chunks[0] ?? "";
  }

  /** 已记下的完整行数（换行的个数） */
  get lines(): number {
    return this.#lines;
  }

  clear(): void {
    this.#chunks = [];
    this.#newlines = [];
    this.#lines = 0;
    this.#chars = 0;
  }

  #trim(): void {
    let excess = this.#lines - this.#limit;
    while (excess > 0 && this.#chunks.length > 0) {
      const first = this.#chunks[0] as string;
      const lines = this.#newlines[0] as number;
      if (lines <= excess) {
        // 整块都要丢
        this.#chunks.shift();
        this.#newlines.shift();
        this.#lines -= lines;
        this.#chars -= first.length;
        excess -= lines;
        continue;
      }
      // 只丢这一块前面的 excess 行：切在第 excess 个换行之后
      let cut = -1;
      for (let i = 0; i < excess; i++) cut = first.indexOf("\n", cut + 1);
      const rest = first.slice(cut + 1);
      this.#chunks[0] = rest;
      this.#newlines[0] = lines - excess;
      this.#lines -= excess;
      this.#chars -= first.length - rest.length;
      excess = 0;
    }
    while (this.#chars > MAX_CHARS && this.#chunks.length > 1) {
      const dropped = this.#chunks.shift() as string;
      this.#lines -= this.#newlines.shift() as number;
      this.#chars -= dropped.length;
    }
  }
}

function countNewlines(text: string): number {
  let count = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) count += 1;
  return count;
}
