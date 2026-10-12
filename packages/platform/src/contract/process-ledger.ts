import type { Platform, ProcRef } from "../platform.ts";

// 测试里起的每个进程都记账：pid 加启动时间。teardown 逐个核对有没有活着的，
// 活着的只在身份对得上时才结束（绝不按 pid 或名字乱杀，决策记录 0006），然后让测试失败。
export class ProcessLedger {
  readonly #platform: Platform;
  readonly #refs = new Map<number, ProcRef>();

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  /** 记一个刚看到的进程。进程已经不在了就没法记，返回 null */
  async track(pid: number): Promise<ProcRef | null> {
    const known = this.#refs.get(pid);
    if (known) return known;
    const identity = await this.#platform.proc.identity(pid);
    if (!identity) return null;
    const ref = { pid, startTime: identity.startTime };
    this.#refs.set(pid, ref);
    return ref;
  }

  add(ref: ProcRef): void {
    this.#refs.set(ref.pid, ref);
  }

  get refs(): ProcRef[] {
    return [...this.#refs.values()];
  }

  /** 记过账的进程里现在还活着的（身份一致才算：pid 被别人用了不算） */
  async survivors(): Promise<ProcRef[]> {
    const alive: ProcRef[] = [];
    for (const ref of this.#refs.values()) {
      const identity = await this.#platform.proc.identity(ref.pid);
      if (identity?.startTime === ref.startTime) alive.push(ref);
    }
    return alive;
  }

  /** teardown：结束还活着的（身份核对过），返回它们，调用方据此断言为空 */
  async cleanup(): Promise<ProcRef[]> {
    const alive = await this.survivors();
    for (const ref of alive) {
      // survivors() 刚核对过身份；这里只给身份一致的进程发信号
      const identity = await this.#platform.proc.identity(ref.pid);
      if (identity?.startTime === ref.startTime) {
        try {
          process.kill(ref.pid, "SIGKILL");
        } catch {
          // 刚好退出了
        }
      }
    }
    return alive;
  }
}
