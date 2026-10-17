import { describe, expect, it, vi } from "vitest";
import { type AppMenuOptions, buildAppMenu } from "./app-menu.ts";

type Item = {
  label?: string;
  accelerator?: string;
  enabled?: boolean;
  visible?: boolean;
  click?: () => void;
};

function build(overrides: Partial<AppMenuOptions> = {}) {
  return buildAppMenu({
    locale: "zh-CN",
    platform: "darwin",
    onNew: () => {},
    onToggleSidebar: () => {},
    onCommandPalette: () => {},
    onQuickOpen: () => {},
    quickOpenEnabled: true,
    ...overrides,
  });
}

function submenuOf(menu: ReturnType<typeof build>, role: "fileMenu" | "viewMenu"): Item[] {
  return (menu.find((item) => item.role === role)?.submenu ?? []) as Item[];
}

describe("buildAppMenu", () => {
  it("[DESKTOP-CREATE-FLOW-03] 文件菜单里有“新建…”，快捷键是 ⌘N（Ctrl+N），点它调用回调", () => {
    const onNew = vi.fn();
    const item = submenuOf(build({ onNew }), "fileMenu").find(
      (entry) => entry.accelerator === "CmdOrCtrl+N",
    );
    expect(item?.label).toBe("新建…");
    item?.click?.();
    expect(onNew).toHaveBeenCalledOnce();
  });

  it("[DESKTOP-LIBRARY-VIEW-61] 视图菜单里有“切换侧栏”，快捷键是 ⌃⌘S，点它调用回调", () => {
    const onToggleSidebar = vi.fn();
    const item = submenuOf(build({ onToggleSidebar }), "viewMenu").find(
      (entry) => entry.accelerator === "Ctrl+Cmd+S",
    );
    expect(item?.label).toBe("切换侧栏");
    item?.click?.();
    expect(onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("[DESKTOP-EDITOR-65] ⌘⇧P 和 F1 都是菜单项，焦点在预览里（按键到不了界面）也能打开命令面板", () => {
    const onCommandPalette = vi.fn();
    const view = submenuOf(build({ onCommandPalette }), "viewMenu");
    const shortcut = view.find((entry) => entry.accelerator === "CmdOrCtrl+Shift+P");
    const f1 = view.find((entry) => entry.accelerator === "F1");
    expect(shortcut?.label).toBe("命令面板");
    expect(f1?.visible).toBe(false);
    shortcut?.click?.();
    f1?.click?.();
    expect(onCommandPalette).toHaveBeenCalledTimes(2);
  });

  it("[DESKTOP-EDITOR-73] 文件菜单里的“快速打开文件”（⌘P）在资源库页灰掉，在项目标签页可用并调用回调", () => {
    const onQuickOpen = vi.fn();
    const find = (menu: ReturnType<typeof build>) =>
      submenuOf(menu, "fileMenu").find((entry) => entry.accelerator === "CmdOrCtrl+P");
    expect(find(build({ quickOpenEnabled: false }))).toMatchObject({
      label: "快速打开文件",
      enabled: false,
    });
    const enabled = find(build({ quickOpenEnabled: true, onQuickOpen }));
    expect(enabled?.enabled).toBe(true);
    enabled?.click?.();
    expect(onQuickOpen).toHaveBeenCalledOnce();
  });

  it("只有 macOS 有以应用名为标题的第一项；英文菜单项是英文", () => {
    const mac = build({ locale: "en" });
    const other = build({ locale: "en", platform: "linux" });
    expect(mac[0]?.role).toBe("appMenu");
    expect(other.some((item) => item.role === "appMenu")).toBe(false);
    expect(submenuOf(other, "fileMenu")[0]?.label).toBe("New…");
    expect(submenuOf(other, "fileMenu")[1]?.label).toBe("Quick Open File");
  });
});
