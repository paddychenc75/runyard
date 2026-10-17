/**
 * 并发合并的任务：正在做时再来请求，不另起一份，做完后补做一次；所有请求者拿到同一个兑现的结果。
 * 控制器的“重读全部数据”靠它（管理进程连着发事件时不会堆出一串重读）。
 */
export class Coalesced {
  readonly #task: () => Promise<void>;
  #running: Promise<void> | undefined;
  #again = false;

  constructor(task: () => Promise<void>) {
    this.#task = task;
  }

  run(): Promise<void> {
    if (this.#running !== undefined) {
      this.#again = true;
      return this.#running;
    }
    const running = (async () => {
      do {
        this.#again = false;
        await this.#task();
      } while (this.#again);
    })().finally(() => {
      this.#running = undefined;
    });
    this.#running = running;
    return running;
  }
}
