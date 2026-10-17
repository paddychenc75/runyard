import { describe, expect, it, vi } from "vitest";
import { QuitCoordinator } from "./quit-coordinator.ts";

function setup(bye: () => Promise<void>, timeoutMs?: number) {
  const log: string[] = [];
  const coordinator = new QuitCoordinator(
    { quit: () => void log.push("quit") },
    async () => {
      log.push("bye");
      await bye();
    },
    timeoutMs,
  );
  return { coordinator, log };
}

describe("QuitCoordinator", () => {
  it("[DESKTOP-WORKSPACE-24] ⌘Q：先向管理进程道别（由它停掉本连接的标签页运行），再退出；道别完成后的退出请求放行", async () => {
    const { coordinator, log } = setup(async () => {});
    expect(coordinator.handleBeforeQuit()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["bye", "quit"]);
    expect(coordinator.handleBeforeQuit()).toBe(false);
  });

  it("道别期间再次退出：拦下，不重复道别也不提前退出", async () => {
    let finish: () => void = () => {};
    const { coordinator, log } = setup(() => new Promise<void>((resolve) => (finish = resolve)));
    expect(coordinator.handleBeforeQuit()).toBe(true);
    expect(coordinator.handleBeforeQuit()).toBe(true);
    expect(log).toEqual(["bye"]);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["bye", "quit"]);
  });

  it("道别失败也照样退出", async () => {
    const { coordinator, log } = setup(() => Promise.reject(new Error("gone")));
    coordinator.handleBeforeQuit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["bye", "quit"]);
  });

  it("道别迟迟没有回复：到时限照样退出，之后迟到的回复不会再退一次", async () => {
    vi.useFakeTimers();
    try {
      let finish: () => void = () => {};
      const { coordinator, log } = setup(
        () => new Promise<void>((resolve) => (finish = resolve)),
        7000,
      );
      expect(coordinator.handleBeforeQuit()).toBe(true);
      await vi.advanceTimersByTimeAsync(6999);
      expect(log).toEqual(["bye"]);
      await vi.advanceTimersByTimeAsync(1);
      expect(log).toEqual(["bye", "quit"]);
      finish();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(log).toEqual(["bye", "quit"]);
      expect(coordinator.handleBeforeQuit()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
