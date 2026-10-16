import { describe, expect, it } from "vitest";
import { QuitCoordinator } from "./quit-coordinator.ts";

function setup(bye: () => Promise<void>) {
  const log: string[] = [];
  const coordinator = new QuitCoordinator({ quit: () => void log.push("quit") }, async () => {
    log.push("bye");
    await bye();
  });
  return { coordinator, log };
}

describe("QuitCoordinator", () => {
  it("第一次退出先道别再退出；道别完成后的退出请求放行", async () => {
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
});
