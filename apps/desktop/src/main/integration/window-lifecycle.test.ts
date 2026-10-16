import { describe, expect, it } from "vitest";
import { type ClosableWindow, keepAliveAfterClose, type LifecycleApp } from "./window-lifecycle.ts";

function setup(closeKeepsAppAlive: boolean) {
  const log: string[] = [];
  const appListeners = new Map<string, () => void>();
  let onClose: ((event: { preventDefault(): void }) => void) | undefined;
  const app: LifecycleApp = {
    on: (event: string, listener: () => void) => void appListeners.set(event, listener),
    quit: () => void log.push("quit"),
  };
  const window: ClosableWindow = {
    on: (_event, listener) => {
      onClose = listener;
    },
    hide: () => void log.push("hide"),
    show: () => void log.push("show"),
    isDestroyed: () => false,
  };
  keepAliveAfterClose(app, window, closeKeepsAppAlive);
  const close = () => {
    let prevented = false;
    onClose?.({ preventDefault: () => (prevented = true) });
    return prevented;
  };
  return { log, appListeners, close };
}

describe("keepAliveAfterClose", () => {
  it("macOS：关窗口只是藏起来，不退出；点 Dock 图标再显示", () => {
    const { log, appListeners, close } = setup(true);
    expect(close()).toBe(true);
    expect(log).toEqual(["hide"]);
    appListeners.get("activate")?.();
    expect(log).toEqual(["hide", "show"]);
    expect(appListeners.has("window-all-closed")).toBe(false);
  });

  it("macOS：退出应用（⌘Q）时关窗口不再拦截", () => {
    const { log, appListeners, close } = setup(true);
    appListeners.get("before-quit")?.();
    expect(close()).toBe(false);
    expect(log).toEqual([]);
  });

  it("其他系统：关掉最后一个窗口就退出", () => {
    const { log, appListeners } = setup(false);
    appListeners.get("window-all-closed")?.();
    expect(log).toEqual(["quit"]);
  });
});
