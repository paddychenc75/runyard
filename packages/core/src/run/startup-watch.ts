import type { LogEntry } from "@runyard/protocol";
import type { RunClock } from "./run-clock.ts";
import type { ReadinessProbe, RunPlan } from "./run-types.ts";

// 一次运行“启动到就绪”这一段的看护：较慢计时、就绪探测、给探测看输出的订阅。
// 状态机本身仍在 RunSession，这里只管计时器和探测的生命周期，状态判断由调用方的回调做。

export class StartupWatch {
  readonly #clock: RunClock;
  readonly #readiness: ReadinessProbe;
  readonly #runId: string;
  #slow = false;
  #slowTimer?: number;
  #abort = new AbortController();
  readonly #lineListeners = new Set<(entry: LogEntry) => void>();

  constructor(deps: { clock: RunClock; readiness: ReadinessProbe; runId: string }) {
    this.#clock = deps.clock;
    this.#readiness = deps.readiness;
    this.#runId = deps.runId;
  }

  get slow(): boolean {
    return this.#slow;
  }

  /** 到点时 `stillStarting()` 为真才标记较慢并通知一次 */
  startSlowTimer(afterMs: number, stillStarting: () => boolean, notify: () => void): void {
    this.#slowTimer = this.#clock.setTimeout(() => {
      this.#slowTimer = undefined;
      if (!stillStarting()) return;
      this.#slow = true;
      notify();
    }, afterMs);
  }

  clearSlowTimer(): void {
    if (this.#slowTimer === undefined) return;
    this.#clock.clearTimeout(this.#slowTimer);
    this.#slowTimer = undefined;
  }

  /** 就绪探测到点后调用 `onReady`（是否还该进入 ready 由调用方判断） */
  awaitReady(plan: RunPlan, onReady: () => void): void {
    void this.#readiness
      .waitReady({
        runId: this.#runId,
        plan,
        signal: this.#abort.signal,
        onLine: (listener) => {
          this.#lineListeners.add(listener);
          return () => void this.#lineListeners.delete(listener);
        },
      })
      .then(onReady);
  }

  /** 每一条日志都要经过这里，`ready.log` 才看得到输出 */
  feed(entry: LogEntry): void {
    for (const listener of this.#lineListeners) listener(entry);
  }

  /** 中止探测（停止、失败、进程退出时） */
  abortReadiness(): void {
    this.#abort.abort();
  }
}
