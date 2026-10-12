import type { SupervisorClock } from "./supervisor-clock.ts";

// 空闲自己退出：没有任何连接且没有任何运行满 idleMs（SUPERVISOR-LIFECYCLE-12 到 14）。
// 计时从“变成空闲”那一刻开始；到点时再核对一次，任何一个条件不满足就不退出。
// 状态一变（连接来去、运行个数变）调用方就调 evaluate()。

export interface IdleMonitor {
  evaluate(): void;
  stop(): void;
}

export function createIdleMonitor(options: {
  clock: SupervisorClock;
  idleMs: number;
  isIdle(): boolean;
  onIdle(): void;
}): IdleMonitor {
  const { clock, idleMs, isIdle, onIdle } = options;
  let timer: number | undefined;
  let stopped = false;

  const clear = () => {
    if (timer !== undefined) clock.clearTimeout(timer);
    timer = undefined;
  };

  return {
    evaluate() {
      if (stopped) return;
      if (!isIdle()) {
        clear();
        return;
      }
      // 已经在计时就让它继续：重复判断不能把计时往后推
      if (timer !== undefined) return;
      timer = clock.setTimeout(() => {
        timer = undefined;
        if (!stopped && isIdle()) onIdle();
      }, idleMs);
    },
    stop() {
      stopped = true;
      clear();
    },
  };
}
