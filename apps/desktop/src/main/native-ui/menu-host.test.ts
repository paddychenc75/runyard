import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import { Menu } from "electron";
import { expect, it, vi } from "vitest";
import { createMenuHost } from "./menu-host.ts";

vi.mock("electron", () => ({
  Menu: { buildFromTemplate: vi.fn((items) => items), setApplicationMenu: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
}));

it("[DESKTOP-SETTINGS-48] 菜单设置先恢复显示聚焦原窗口，再发送设置导航", () => {
  const order: string[] = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => order.push("restore"),
    show: () => order.push("show"),
    focus: () => order.push("focus"),
    webContents: { focus: () => order.push("renderer") },
  } as unknown as BrowserWindow;
  createMenuHost({
    window,
    ipcHost: {
      send: (_channel, event, payload) => order.push(`${event}:${(payload as { id: string }).id}`),
    },
    locale: "en",
    platform: "darwin",
    development: false,
    version: "0.0.0",
    openExternal: () => {},
    checkUpdates: async () => "unavailable",
  }).install();
  const template = vi.mocked(Menu.buildFromTemplate).mock.calls.at(-1)?.[0] ?? [];
  const items = template.flatMap((item) =>
    Array.isArray(item.submenu) ? item.submenu : [],
  ) as MenuItemConstructorOptions[];
  const settings = items.find((item) => item.accelerator === "CmdOrCtrl+,");
  expect(settings).toBeDefined();
  if (!settings?.click) throw new Error("设置菜单动作缺失");
  (settings.click as () => void)();
  expect(order).toEqual(["restore", "show", "focus", "renderer", "command.run:app.settings"]);
});
