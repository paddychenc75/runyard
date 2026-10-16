import { describe, expect, it } from "vitest";
import { claimSingleInstance, type SingleInstanceApp } from "./single-instance.ts";

function fakeApp(lock: boolean) {
  const log: string[] = [];
  let secondInstance: (() => void) | undefined;
  const app: SingleInstanceApp = {
    requestSingleInstanceLock: () => lock,
    on: (_event, listener) => {
      secondInstance = listener;
    },
    exit: (code) => void log.push(`exit ${code}`),
  };
  return { app, log, second: () => secondInstance?.() };
}

describe("claimSingleInstance", () => {
  it("第二次启动拿不到锁：自己退出，不创建窗口", () => {
    const { app, log } = fakeApp(false);
    expect(claimSingleInstance(app, () => log.push("focus"))).toBe(false);
    expect(log).toEqual(["exit 0"]);
  });

  it("第一次启动拿到锁；之后有人再启动，只聚焦已有窗口", () => {
    const { app, log, second } = fakeApp(true);
    expect(claimSingleInstance(app, () => log.push("focus"))).toBe(true);
    second();
    expect(log).toEqual(["focus"]);
  });
});
