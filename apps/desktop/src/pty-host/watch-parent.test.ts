import { afterEach, describe, expect, it, vi } from "vitest";
import { watchParent } from "./watch-parent.ts";

afterEach(() => vi.useRealTimers());

function setup(first: { startTime: number } | null) {
  vi.useFakeTimers();
  let current = first;
  const gone = vi.fn();
  const deps = {
    parentPid: 4242,
    identity: async () => current,
    onGone: gone,
    intervalMs: 1000,
  };
  return { deps, gone, set: (value: { startTime: number } | null) => (current = value) };
}

describe("盯着启动 pty-host 的进程", () => {
  it("父进程活着、身份不变：什么都不做", async () => {
    const { deps, gone } = setup({ startTime: 5 });
    const stop = await watchParent(deps);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gone).not.toHaveBeenCalled();
    stop();
  });

  it("父进程没了（应用被强制结束）：下一次检查就收尾，只通知一次", async () => {
    const { deps, gone, set } = setup({ startTime: 5 });
    await watchParent(deps);
    set(null);
    await vi.advanceTimersByTimeAsync(1000);
    expect(gone).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("pid 被别的进程占用（启动时间变了）也算父进程没了", async () => {
    const { deps, gone, set } = setup({ startTime: 5 });
    await watchParent(deps);
    set({ startTime: 99 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(gone).toHaveBeenCalledTimes(1);
  });

  it("一开始就找不到父进程：马上收尾", async () => {
    const { deps, gone } = setup(null);
    await watchParent(deps);
    expect(gone).toHaveBeenCalledTimes(1);
  });
});
