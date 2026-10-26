import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { type AppMenuOptions, buildAppMenu } from "./app-menu.ts";

function build(overrides: Partial<AppMenuOptions> = {}) {
  return buildAppMenu({
    locale: "zh-CN",
    platform: "darwin",
    development: false,
    runCommand: () => {},
    onCommandPalette: () => {},
    onQuickOpen: () => {},
    onCheckUpdates: () => {},
    onOpenHelp: () => {},
    onReportIssue: () => {},
    projectTabActive: true,
    ...overrides,
  });
}

type Menu = ReturnType<typeof build>;

function itemsOf(menu: Menu, title: string): MenuItemConstructorOptions[] {
  const top = menu.find((entry) => entry.label === title);
  return (top?.submenu ?? []) as MenuItemConstructorOptions[];
}

function allItems(menu: Menu): MenuItemConstructorOptions[] {
  return menu.flatMap((top) => [top, ...((top.submenu ?? []) as MenuItemConstructorOptions[])]);
}

function labelsOf(menu: Menu): string[] {
  return allItems(menu)
    .filter((item) => item.type !== "separator")
    .map((item) => item.label ?? "");
}

const press = (item: MenuItemConstructorOptions | undefined): void => {
  (item?.click as (() => void) | undefined)?.();
};

const named = (items: MenuItemConstructorOptions[], label: string) =>
  items.find((item) => item.label === label);

describe("buildAppMenu 结构", () => {
  it("macOS 上顶层依次是 应用、文件、编辑、显示、项目、窗口、帮助", () => {
    expect(build().map((top) => top.label)).toEqual([
      "Runyard",
      "文件",
      "编辑",
      "显示",
      "项目",
      "窗口",
      "帮助",
    ]);
    expect(build({ locale: "en" }).map((top) => top.label)).toEqual([
      "Runyard",
      "File",
      "Edit",
      "View",
      "Playground",
      "Window",
      "Help",
    ]);
  });

  it("应用菜单依次是 关于、检查更新…、设置…、服务、隐藏、退出", () => {
    const app = build()[0]?.submenu as MenuItemConstructorOptions[];
    expect(app.filter((item) => item.type !== "separator").map((item) => item.label)).toEqual([
      "关于 Runyard",
      "检查更新…",
      "设置…",
      "服务",
      "隐藏 Runyard",
      "隐藏其他",
      "全部显示",
      "退出 Runyard",
    ]);
  });

  it("中文菜单里没有英文、英文菜单里没有中文（应用名除外），每一项都有显式 label", () => {
    const zh = labelsOf(build({ development: true }));
    const en = labelsOf(build({ locale: "en", development: true }));
    for (const label of [...zh, ...en]) expect(label).not.toBe("");
    for (const label of zh) expect(label.replaceAll("Runyard", "")).not.toMatch(/[A-Za-z]/);
    for (const label of en) expect(label).not.toMatch(/[一-鿿]/);
  });

  it("系统角色的项也带显式 label，不靠系统语言取名", () => {
    for (const locale of ["zh-CN", "en"] as const) {
      const withRole = allItems(build({ locale, development: true })).filter(
        (item) => item.role !== undefined && item.type !== "separator",
      );
      expect(withRole.length).toBeGreaterThan(10);
      for (const item of withRole) expect(item.label, String(item.role)).toBeTruthy();
    }
  });

  it("正式构建没有重新载入、强制重新载入、开发者工具", () => {
    const roles = allItems(build()).map((item) => item.role);
    expect(roles).not.toContain("reload");
    expect(roles).not.toContain("forceReload");
    expect(roles).not.toContain("toggleDevTools");
    expect(labelsOf(build())).not.toContain("开发者工具");
  });

  it("开发构建保留它们，重新载入换了快捷键，不占用 ⌘R", () => {
    const view = itemsOf(build({ development: true }), "显示");
    const roles = view.map((item) => item.role);
    expect(roles).toEqual(expect.arrayContaining(["reload", "forceReload", "toggleDevTools"]));
    expect(view.find((item) => item.role === "reload")?.accelerator).not.toBe("CmdOrCtrl+R");
  });

  it("同一个快捷键不会被两个可见菜单项占用", () => {
    for (const development of [false, true]) {
      const accelerators = allItems(build({ development }))
        .filter((item) => item.accelerator !== undefined && item.visible !== false)
        .map((item) => item.accelerator);
      expect(new Set(accelerators).size).toBe(accelerators.length);
    }
  });

  it("非 macOS 没有应用菜单，设置、检查更新和退出放在文件菜单里", () => {
    const menu = build({ platform: "linux" });
    expect(menu[0]?.label).toBe("文件");
    expect(menu.some((top) => top.label === "Runyard")).toBe(false);
    const file = itemsOf(menu, "文件");
    expect(named(file, "设置…")).toBeDefined();
    expect(named(file, "检查更新…")).toBeDefined();
    expect(file.some((item) => item.role === "quit")).toBe(true);
  });
});

describe("buildAppMenu 命令", () => {
  it("应用菜单里的“设置…”快捷键 ⌘,，只调用唯一的“打开设置”命令", () => {
    const runCommand = vi.fn();
    const app = build({ runCommand })[0]?.submenu as MenuItemConstructorOptions[];
    const settings = named(app, "设置…");
    expect(settings?.accelerator).toBe("CmdOrCtrl+,");
    press(settings);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("app.settings");
  });

  it("“检查更新…”调用回调", () => {
    const onCheckUpdates = vi.fn();
    const app = build({ onCheckUpdates })[0]?.submenu as MenuItemConstructorOptions[];
    press(named(app, "检查更新…"));
    expect(onCheckUpdates).toHaveBeenCalledOnce();
  });

  it("[DESKTOP-CREATE-FLOW-03] 文件菜单里有“新建…”，快捷键是 ⌘N（Ctrl+N），点它执行 app.new", () => {
    const runCommand = vi.fn();
    const item = named(itemsOf(build({ runCommand }), "文件"), "新建…");
    expect(item?.accelerator).toBe("CmdOrCtrl+N");
    press(item);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("app.new");
  });

  it("“关闭标签页”是 ⌘W，“关闭窗口”是 ⇧⌘W 且保留关窗口的系统行为", () => {
    const runCommand = vi.fn();
    const file = itemsOf(build({ runCommand }), "文件");
    const closeTab = named(file, "关闭标签页");
    expect(closeTab?.accelerator).toBe("CmdOrCtrl+W");
    press(closeTab);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("app.closeTab");
    const closeWindow = named(file, "关闭窗口");
    expect(closeWindow).toMatchObject({ role: "close", accelerator: "CmdOrCtrl+Shift+W" });
  });

  it("资源库页上“关闭标签页”灰掉（资源库标签不能关）", () => {
    const closeTab = (active: boolean) =>
      named(itemsOf(build({ projectTabActive: active }), "文件"), "关闭标签页");
    expect(closeTab(false)?.enabled).toBe(false);
    expect(closeTab(true)?.enabled).not.toBe(false);
  });

  it("[DESKTOP-LIBRARY-VIEW-61] 显示菜单里有“显示/隐藏侧栏”，快捷键是 ⌃⌘S，点它执行 app.toggleSidebar", () => {
    const runCommand = vi.fn();
    const item = named(itemsOf(build({ runCommand }), "显示"), "显示/隐藏侧栏");
    expect(item?.accelerator).toBe("Ctrl+Cmd+S");
    press(item);
    expect(runCommand).toHaveBeenCalledExactlyOnceWith("app.toggleSidebar");
  });

  it("[DESKTOP-EDITOR-65] ⌘⇧P 和 F1 都是菜单项，命令面板只有一个可见的", () => {
    const onCommandPalette = vi.fn();
    const view = itemsOf(build({ onCommandPalette }), "显示");
    const shortcut = view.find((entry) => entry.accelerator === "CmdOrCtrl+Shift+P");
    const f1 = view.find((entry) => entry.accelerator === "F1");
    expect(shortcut?.label).toBe("命令面板");
    expect(shortcut?.visible).not.toBe(false);
    expect(f1?.visible).toBe(false);
    press(shortcut);
    press(f1);
    expect(onCommandPalette).toHaveBeenCalledTimes(2);
    expect(
      view.filter((entry) => entry.label === "命令面板" && entry.visible !== false),
    ).toHaveLength(1);
  });

  it("[DESKTOP-EDITOR-73] 文件菜单里的“快速打开文件”（⌘P）在资源库页灰掉，在项目标签页可用并调用回调", () => {
    const onQuickOpen = vi.fn();
    const find = (menu: Menu) =>
      itemsOf(menu, "文件").find((entry) => entry.accelerator === "CmdOrCtrl+P");
    expect(find(build({ projectTabActive: false }))).toMatchObject({
      label: "快速打开文件",
      enabled: false,
    });
    const enabled = find(build({ projectTabActive: true, onQuickOpen }));
    expect(enabled?.enabled).toBe(true);
    press(enabled);
    expect(onQuickOpen).toHaveBeenCalledOnce();
  });

  it("项目菜单：运行 ⌘R、停止运行 ⌘.、重启 ⇧⌘R 等，点了执行对应命令", () => {
    const runCommand = vi.fn();
    const project = itemsOf(build({ runCommand }), "项目");
    const byLabel = (label: string) => named(project, label);
    expect(byLabel("运行")?.accelerator).toBe("CmdOrCtrl+R");
    expect(byLabel("停止运行")?.accelerator).toBe("CmdOrCtrl+.");
    expect(byLabel("重启")?.accelerator).toBe("CmdOrCtrl+Shift+R");
    for (const label of [
      "运行",
      "停止运行",
      "重启",
      "在访达中显示",
      "在终端中打开",
      "复制链接",
      "移到废纸篓…",
    ]) {
      press(byLabel(label));
    }
    expect(runCommand.mock.calls.map(([id]) => id)).toEqual([
      "project.run",
      "project.stop",
      "project.restart",
      "project.reveal",
      "project.openTerminal",
      "project.copyLink",
      "project.trash",
    ]);
  });

  it("资源库页上项目菜单的操作全部灰掉", () => {
    const project = itemsOf(build({ projectTabActive: false }), "项目").filter(
      (item) => item.type !== "separator",
    );
    expect(project.length).toBe(7);
    for (const item of project) expect(item.enabled, item.label).toBe(false);
  });

  it("帮助菜单有 Runyard 帮助 和 报告问题…，点了调用回调", () => {
    const onOpenHelp = vi.fn();
    const onReportIssue = vi.fn();
    const help = itemsOf(build({ onOpenHelp, onReportIssue }), "帮助");
    press(named(help, "Runyard 帮助"));
    press(named(help, "报告问题…"));
    expect(onOpenHelp).toHaveBeenCalledOnce();
    expect(onReportIssue).toHaveBeenCalledOnce();
    expect(build().find((top) => top.label === "帮助")?.role).toBe("help");
  });

  it("英文菜单项是英文，用的是同一批命令和快捷键", () => {
    const en = build({ locale: "en" });
    const file = itemsOf(en, "File");
    expect(file[0]?.label).toBe("New…");
    expect(named(file, "Close Tab")?.accelerator).toBe("CmdOrCtrl+W");
    expect(named(itemsOf(en, "Playground"), "Move to Trash…")).toBeDefined();
    const appItems = (en[0]?.submenu ?? []) as MenuItemConstructorOptions[];
    expect(appItems.map((item) => item.label)).toContain("Settings…");
  });
  it("[DESKTOP-SETTINGS-46] 设置页⌘W可用，返回资源库后恢复菜单可用状态", () => {
    const settings = itemsOf(
      build({ locale: "en", projectTabActive: false, settingsPageActive: true }),
      "File",
    );
    expect(settings.filter((item) => item.label === "Close Window")).toHaveLength(1);
    expect(named(settings, "Close Tab")).toMatchObject({
      accelerator: "CmdOrCtrl+W",
      enabled: true,
    });
    const main = itemsOf(build({ locale: "en", projectTabActive: false }), "File");
    expect(named(main, "Close Tab")).toMatchObject({ accelerator: "CmdOrCtrl+W", enabled: false });
  });
});
