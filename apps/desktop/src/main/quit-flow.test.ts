import { describe, expect, it } from "vitest";
import { keepAliveAfterClose } from "./integration/window-lifecycle.ts";
import { registerQuitFlow } from "./quit-coordinator.ts";

// 与 index.ts 同样的接线：窗口生命周期先登记，退出流程后登记；app 是一个会按顺序触发监听的假对象
function fakeElectron(bye: () => Promise<void>) {
  const log: string[] = [];
  const beforeQuit: Array<(event: { preventDefault(): void }) => void> = [];
  const others = new Map<string, (event: { preventDefault(): void }) => void>();
  let onClose: ((event: { preventDefault(): void }) => void) | undefined;
  const app = {
    on(event: string, listener: (event: { preventDefault(): void }) => void) {
      if (event === "before-quit") beforeQuit.push(listener);
      else others.set(event, listener);
    },
    // 与 Electron 一致：quit() 先发 before-quit；没人拦下才真的退出并关窗口
    quit() {
      log.push("app.quit");
      const prevented = emitBeforeQuit();
      if (!prevented) {
        log.push("exit");
        onClose?.({ preventDefault: () => log.push("close-blocked") });
      }
    },
  };
  const emitBeforeQuit = () => {
    let prevented = false;
    for (const listener of beforeQuit) listener({ preventDefault: () => (prevented = true) });
    return prevented;
  };
  const window = {
    on: (_event: "close", listener: (event: { preventDefault(): void }) => void) => {
      onClose = listener;
    },
    hide: () => void log.push("hide"),
    show: () => void log.push("show"),
    isDestroyed: () => false,
  };
  keepAliveAfterClose(app as never, window, true);
  registerQuitFlow(app, async () => {
    log.push("bye");
    await bye();
  });
  return { log, app, window, others, emitBeforeQuit, closeWindow: () => onClose };
}

describe("退出接线", () => {
  it("[DESKTOP-WORKSPACE-24] ⌘Q：先道别再退出，连按 ⌘Q 只道别一次、只调一次 app.quit()，退出时关窗口不被拦成隐藏", async () => {
    let finish: () => void = () => {};
    const { log, emitBeforeQuit, closeWindow } = fakeElectron(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    expect(emitBeforeQuit()).toBe(true);
    expect(emitBeforeQuit()).toBe(true);
    expect(log).toEqual(["bye"]);
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(log).toEqual(["bye", "app.quit", "exit"]);
    // 退出过程中关窗口：不拦、不隐藏
    let prevented = false;
    closeWindow()?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(false);
    expect(log).not.toContain("hide");
  });

  it("[DESKTOP-WORKSPACE-23] 红色关闭按钮只隐藏窗口，不道别（运行不受影响）；点 Dock 图标再显示", () => {
    const { log, others, closeWindow } = fakeElectron(async () => {});
    let prevented = false;
    closeWindow()?.({ preventDefault: () => (prevented = true) });
    expect(prevented).toBe(true);
    expect(log).toEqual(["hide"]);
    others.get("activate")?.({ preventDefault: () => {} });
    expect(log).toEqual(["hide", "show"]);
  });
});
