// 每个文件路径一个计时器：重新计时会取消上一个。自动保存的“停止输入 1 秒后”靠它。
export class PathTimers {
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 暂缓计时的文件（输入法组词中）：暂缓期间不起计时器，到点了也不执行 */
  readonly #held = new Set<string>();

  /** 重新计时 */
  restart(path: string, ms: number, run: () => void): void {
    this.cancel(path);
    if (this.#held.has(path)) return;
    this.#timers.set(
      path,
      setTimeout(() => {
        this.#timers.delete(path);
        if (!this.#held.has(path)) run();
      }, ms),
    );
  }

  /** 开始暂缓：已有的计时作废 */
  hold(path: string): void {
    this.#held.add(path);
    this.cancel(path);
  }

  /** 结束暂缓；之前确实在暂缓返回 true */
  release(path: string): boolean {
    return this.#held.delete(path);
  }

  cancel(path: string): void {
    const timer = this.#timers.get(path);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#timers.delete(path);
  }

  cancelAll(): void {
    for (const path of [...this.#timers.keys()]) this.cancel(path);
  }
}
