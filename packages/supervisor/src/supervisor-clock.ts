import type { RunClock } from "@runyard/core";

// 管理进程用的时钟就是运行引擎要的那一个（FakeClock 满足它）；真实的版本只在这里包一次 setTimeout
export type SupervisorClock = RunClock;

export function createSystemClock(): SupervisorClock {
  let nextId = 1;
  const timers = new Map<number, NodeJS.Timeout>();
  return {
    now: () => Date.now(),
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
}
