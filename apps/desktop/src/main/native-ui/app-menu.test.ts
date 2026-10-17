import { describe, expect, it, vi } from "vitest";
import { buildAppMenu } from "./app-menu.ts";

describe("buildAppMenu", () => {
  it("[DESKTOP-CREATE-FLOW-03] 文件菜单里有“新建…”，快捷键是 ⌘N（Ctrl+N），点它调用回调", () => {
    const onNew = vi.fn();
    const menu = buildAppMenu({ locale: "zh-CN", platform: "darwin", onNew });
    const file = menu.find((item) => item.role === "fileMenu");
    const submenu = file?.submenu as { label?: string; accelerator?: string; click?: () => void }[];
    const item = submenu.find((entry) => entry.accelerator === "CmdOrCtrl+N");
    expect(item?.label).toBe("新建…");
    item?.click?.();
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("只有 macOS 有以应用名为标题的第一项；英文菜单项是英文", () => {
    const mac = buildAppMenu({ locale: "en", platform: "darwin", onNew: () => {} });
    const other = buildAppMenu({ locale: "en", platform: "linux", onNew: () => {} });
    expect(mac[0]?.role).toBe("appMenu");
    expect(other.some((item) => item.role === "appMenu")).toBe(false);
    const file = other.find((item) => item.role === "fileMenu");
    const submenu = (file?.submenu ?? []) as { label?: string }[];
    expect(submenu[0]?.label).toBe("New…");
  });
});
