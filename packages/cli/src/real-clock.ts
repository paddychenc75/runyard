import type { RunClock } from "@runyard/core";

// 真实时钟：RunClock 要数字编号，Node 的定时器是对象，所以用表对应起来
export function createRealClock(): RunClock {
  const timers = new Map<number, NodeJS.Timeout>();
  let next = 0;
  return {
    now: () => Date.now(),
    setTimeout(callback, ms) {
      const id = ++next;
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
