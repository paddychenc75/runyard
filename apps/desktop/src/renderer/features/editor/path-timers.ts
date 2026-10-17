// 每个文件路径一个计时器：重新计时会取消上一个。自动保存的“停止输入 1 秒后”靠它。
export class PathTimers {
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** 重新计时 */
  restart(path: string, ms: number, run: () => void): void {
    this.cancel(path);
    this.#timers.set(
      path,
      setTimeout(() => {
        this.#timers.delete(path);
        run();
      }, ms),
    );
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
