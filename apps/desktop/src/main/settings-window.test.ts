import { describe, expect, it, vi } from "vitest";
import type { Bounds } from "../shared/layout.ts";
import { SettingsWindowController } from "./settings-window.ts";

function world() {
  let saved: Bounds | null = null;
  const listeners = new Map<string, (() => void)[]>();
  const window = {
    isDestroyed: () => false,
    isMinimized: () => false,
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(() => {
      for (const fn of listeners.get("close") ?? []) fn();
      for (const fn of listeners.get("closed") ?? []) fn();
    }),
    getNormalBounds: () => ({ x: 80, y: 90, width: 820, height: 960 }),
    on: (event: string, fn: () => void) =>
      listeners.set(event, [...(listeners.get(event) ?? []), fn]),
  };
  const create = vi.fn(() => window);
  const controller = new SettingsWindowController({
    create,
    load: () => saved,
    save: (bounds) => {
      saved = bounds;
    },
  });
  return { controller, window, create };
}

describe("独立设置窗口", () => {
  it("[DESKTOP-SETTINGS-37] 已开着时只提到前面，不再创建", () => {
    const w = world();
    w.controller.open();
    w.controller.open();
    expect(w.create).toHaveBeenCalledTimes(1);
    expect(w.window.focus).toHaveBeenCalledTimes(2);
  });
  it("[DESKTOP-SETTINGS-39] 关闭只调用自己的窗口，清掉单例以便重新打开", () => {
    const w = world();
    w.controller.open();
    w.controller.close();
    expect(w.window.close).toHaveBeenCalledOnce();
    expect(w.controller.current).toBeNull();
    w.controller.open();
    expect(w.create).toHaveBeenCalledTimes(2);
  });
  it("[DESKTOP-SETTINGS-40] 关闭后重新打开使用已保存的位置和大小", () => {
    const w = world();
    w.controller.open();
    w.controller.close();
    w.controller.open();
    expect(w.create).toHaveBeenLastCalledWith({ x: 80, y: 90, width: 820, height: 960 });
  });
});
