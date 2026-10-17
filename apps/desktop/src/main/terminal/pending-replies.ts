/**
 * 向 pty-host 发请求、等它按编号回话：到时限没回就用后备值，pty-host 没了就全部用后备值。
 * 请求编号由这里发。结束终端（回 closed）和查前台命令（回 foreground）都用它。
 */
export class PendingReplies<T> {
  readonly #waiters = new Map<number, (value: T) => void>();
  readonly #fallback: T;
  #next = 1;

  constructor(fallback: T) {
    this.#fallback = fallback;
  }

  /** 登记一个请求：send 里把编号发出去；返回回话，或到 timeoutMs 后的后备值 */
  ask(timeoutMs: number, send: (id: number) => void): Promise<T> {
    const id = this.#next++;
    const reply = new Promise<T>((resolve) => {
      this.#waiters.set(id, resolve);
      setTimeout(() => this.reply(id, this.#fallback), timeoutMs).unref();
    });
    send(id);
    return reply;
  }

  reply(id: number, value: T): void {
    const waiter = this.#waiters.get(id);
    if (waiter === undefined) return;
    this.#waiters.delete(id);
    waiter(value);
  }

  /** pty-host 没了：还在等的全部按后备值结束 */
  settleAll(): void {
    for (const id of [...this.#waiters.keys()]) this.reply(id, this.#fallback);
  }
}
