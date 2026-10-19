import type { BrowserWindow } from "electron";
import { describe, expect, it } from "vitest";
import { createFlushGates } from "./flush-gates.ts";

function world(minimized: boolean) {
  const calls: string[] = [];
  const window = {
    isDestroyed: () => false,
    isMinimized: () => minimized,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
    webContents: { send: (_channel: string, event: string) => calls.push(event), on: () => {} },
  } as unknown as BrowserWindow;
  return { calls, gates: createFlushGates(window) };
}

describe("退出前的主窗口询问", () => {
  it("[DESKTOP-EDITOR-28] 显示并聚焦主窗口后才发退出预检，收到ack后仍等待用户取消", async () => {
    const { calls, gates } = world(false);
    const pending = gates.quit.request();
    expect(calls).toEqual(["show", "focus", "app.quitRequested"]);
    gates.quit.reply({ id: 1, reply: "ack" });
    gates.quit.reply({ id: 1, reply: "cancel" });
    expect(await pending).toBe(false);
  });
  it("[DESKTOP-EDITOR-27] 最小化的主窗口先还原，保存完成才允许退出", async () => {
    const { calls, gates } = world(true);
    const pending = gates.quit.request();
    expect(calls).toEqual(["restore", "show", "focus", "app.quitRequested"]);
    gates.quit.reply({ id: 1, reply: "ack" });
    gates.quit.reply({ id: 1, reply: "proceed" });
    expect(await pending).toBe(true);
  });
});
