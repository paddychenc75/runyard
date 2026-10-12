// 客户端要的时间能力：当前时间、睡眠（重连的退避）、限时（等一条握手消息）。
// 测试里换成假的，重连的 3 秒上限不用真的等；@runyard/testing 的 FakeClock 加一个 sleep 就满足。
export interface ClientClock {
  now(): number;
  sleep(ms: number): Promise<void>;
  setTimeout(callback: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export function createSystemClock(): ClientClock {
  let nextId = 1;
  const timers = new Map<number, NodeJS.Timeout>();
  const clock: ClientClock = {
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => clock.setTimeout(resolve, ms)),
    setTimeout(callback, ms) {
      const id = nextId++;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          callback();
        }, ms),
      );
      return id;
    },
    clearTimeout(id) {
      const timer = timers.get(id);
      if (timer === undefined) return;
      clearTimeout(timer);
      timers.delete(id);
    },
  };
  return clock;
}
