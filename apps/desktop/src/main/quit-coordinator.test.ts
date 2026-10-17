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

describe("退出前先问编辑器（beforeBye）", () => {
  function withGate(beforeBye: () => Promise<boolean>) {
    const log: string[] = [];
    const coordinator = new QuitCoordinator(
      { quit: () => void log.push("quit") },
      async () => void log.push("bye"),
      7000,
      beforeBye,
    );
    return { coordinator, log };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it("[DESKTOP-EDITOR-27] 编辑器写完放行之后，才道别（停运行）并退出", async () => {
    const order: string[] = [];
    const { coordinator, log } = withGate(async () => {
      order.push("flushed");
      return true;
    });
    expect(coordinator.handleBeforeQuit()).toBe(true);
    await settle();
    expect(order).toEqual(["flushed"]);
    expect(log).toEqual(["bye", "quit"]);
  });

  it("[DESKTOP-EDITOR-28] 用户在询问里选“取消”：不道别、不退出（运行不会被停掉），之后还能再按 ⌘Q", async () => {
    let answer = false;
    const { coordinator, log } = withGate(async () => answer);
    expect(coordinator.handleBeforeQuit()).toBe(true);
    await settle();
    expect(log).toEqual([]);
    answer = true;
    expect(coordinator.handleBeforeQuit()).toBe(true);
    await settle();
    expect(log).toEqual(["bye", "quit"]);
  });

  it("询问期间再按 ⌘Q：拦下，不重复问", async () => {
    let finish: (proceed: boolean) => void = () => {};
    const asked = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const { coordinator, log } = withGate(asked);
    coordinator.handleBeforeQuit();
    expect(coordinator.handleBeforeQuit()).toBe(true);
    expect(asked).toHaveBeenCalledTimes(1);
    finish(true);
    await settle();
    expect(log).toEqual(["bye", "quit"]);
  });

  it("询问本身出错：按放行处理，不让 ⌘Q 失灵", async () => {
    const { coordinator, log } = withGate(() => Promise.reject(new Error("renderer gone")));
    coordinator.handleBeforeQuit();
    await settle();
    expect(log).toEqual(["bye", "quit"]);
  });
});
