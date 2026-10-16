import type { RunObserver } from "./run-module.ts";

/** 把几个观察者并成一个：每个钩子按顺序都调用（日志、空闲停止、崩溃记录各管各的） */
export function combineObservers(...observers: readonly RunObserver[]): RunObserver {
  return {
    mentioned: (run, session) => {
      for (const o of observers) o.mentioned?.(run, session);
    },
    state: (event) => {
      for (const o of observers) o.state?.(event);
    },
    exit: (event) => {
      for (const o of observers) o.exit?.(event);
    },
    log: (runId, entry) => {
      for (const o of observers) o.log?.(runId, entry);
    },
    spawned: (event) => {
      for (const o of observers) o.spawned?.(event);
    },
  };
}
