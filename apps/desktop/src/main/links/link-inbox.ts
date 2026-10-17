// 链接收件箱：macOS 的 open-url 事件在冷启动时早于 ready（规格 DESKTOP-LINKS-05），
// 那时资源库还没读出来，不能处理。入口最前面就把监听挂上，来的链接先排队，处理程序就绪后一次交出。

/** 排队的上限：启动期间不会有人点这么多次，防的是被刷 */
const MAX_QUEUED = 20;

export class LinkInbox {
  #queue: string[] = [];
  #handler: ((address: string) => void) | null = null;

  push(address: string): void {
    if (this.#handler !== null) {
      this.#handler(address);
      return;
    }
    if (this.#queue.length < MAX_QUEUED) this.#queue.push(address);
  }

  /** 处理程序就绪：先处理排着的，之后来的直接处理 */
  attach(handler: (address: string) => void): void {
    this.#handler = handler;
    const queued = this.#queue;
    this.#queue = [];
    for (const address of queued) handler(address);
  }
}
