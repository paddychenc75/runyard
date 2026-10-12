// 假时钟：不真的等待，由测试推进时间。运行引擎的超时和定时器（停止 3 秒、优雅等待 graceMs、
// 慢启动 30 秒、空闲 30 分钟、管理进程空闲 60 秒）都应通过一个这样的接口取时间和设定时器。
// 生产代码在自己的包里声明需要的最小结构类型，FakeClock 在结构上满足它，所以生产代码不必导入本包。

export type TimerId = number;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerId;
  clearTimeout(id: TimerId): void;
  setInterval(callback: () => void, ms: number): TimerId;
  clearInterval(id: TimerId): void;
}

interface Timer {
  readonly id: TimerId;
  readonly callback: () => void;
  readonly interval: number | null;
  due: number;
  seq: number;
}

// 让已经排队的微任务、nextTick 和流事件都跑完。不是等待时间，只是让出一轮事件循环
export async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// 默认起点是固定的纪元毫秒，让测试里的启动时间可复现
export const FAKE_EPOCH = 1_700_000_000_000;

export class FakeClock implements Clock {
  #now: number;
  #nextId = 1;
  #seq = 0;
  readonly #timers = new Map<TimerId, Timer>();

  constructor(start: number = FAKE_EPOCH) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, ms: number): TimerId {
    return this.#add(callback, ms, null);
  }

  setInterval(callback: () => void, ms: number): TimerId {
    if (!(ms > 0)) throw new Error("setInterval 的间隔必须大于 0，否则推进时间会死循环");
    return this.#add(callback, ms, ms);
  }

  clearTimeout(id: TimerId): void {
    this.#timers.delete(id);
  }

  clearInterval(id: TimerId): void {
    this.#timers.delete(id);
  }

  /** 到点才完成的 Promise；返回的 Promise 只在测试推进时间后才会完成 */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => this.setTimeout(resolve, ms));
  }

  /** 还没触发的定时器个数，断言“没有泄漏的定时器”用 */
  pendingTimers(): number {
    return this.#timers.size;
  }

  /**
   * 把时间推进 ms 毫秒：按到点顺序（同一时刻按设定顺序）逐个触发，每触发一个就让异步工作跑完，
   * 这样定时器回调里启动的 Promise 链会在下一个定时器之前走完，和真实时间里的先后一致。
   */
  async advance(ms: number): Promise<void> {
    if (!(ms >= 0)) throw new Error("advance 的毫秒数不能是负数");
    const target = this.#now + ms;
    await settle();
    for (;;) {
      const next = this.#earliest(target);
      if (next === undefined) break;
      this.#now = next.due;
      if (next.interval === null) this.#timers.delete(next.id);
      else {
        next.due += next.interval;
        next.seq = this.#seq++;
      }
      next.callback();
      await settle();
    }
    this.#now = target;
    await settle();
  }

  #add(callback: () => void, ms: number, interval: number | null): TimerId {
    const id = this.#nextId++;
    this.#timers.set(id, {
      id,
      callback,
      interval,
      due: this.#now + Math.max(0, ms),
      seq: this.#seq++,
    });
    return id;
  }

  #earliest(limit: number): Timer | undefined {
    let best: Timer | undefined;
    for (const timer of this.#timers.values()) {
      if (timer.due > limit) continue;
      if (
        best === undefined ||
        timer.due < best.due ||
        (timer.due === best.due && timer.seq < best.seq)
      ) {
        best = timer;
      }
    }
    return best;
  }
}
