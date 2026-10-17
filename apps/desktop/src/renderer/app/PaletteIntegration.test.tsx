// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState, PlaygroundRow } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
import { sampleTab } from "./sample-tab.ts";

// 命令面板接进真实外壳之后的样子：哪些命令在哪一页上登记、点了做的是不是菜单和按钮里同一件事。
// 面板自己的行为（搜索、键盘、焦点）在 features/palette/PaletteHost.test.tsx。

beforeEach(() => {
  (Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);
const row: PlaygroundRow = {
  id: "demo",
  name: "demo",
  path: "/lib/demo",
  kind: "server",
  state: "ready",
  active: true,
  previewing: true,
  busy: false,
  note: "",
  templateId: "react19",
  templateName: null,
  port: 7101,
  autoClean: { enabled: false, days: null },
  lastUsedAt: NOW,
  lastOpenedAt: NOW,
  createdBy: { kind: "user" },
  createdAt: 1,
  missing: false,
};

const libraryState = (extra: Partial<LibraryState> = {}): LibraryState => ({
  locale: "zh-CN",
  libraryRoot: "~/Runyard",
  error: null,
  closeRequest: null,
  templates: [],
  runs: [],
  loaded: true,
  recentTemplates: [],
  tabs: [],
  activeTab: "library",
  playgrounds: [row],
  ...extra,
});

const projectState = (extra: Partial<ReturnType<typeof sampleTab>> = {}) =>
  libraryState({
    tabs: [sampleTab({ id: "demo", name: "demo", previewUrl: "http://127.0.0.1:7101/", ...extra })],
    activeTab: "demo",
  });

function setup(state: LibraryState) {
  const events = new Map<string, (payload?: unknown) => void>();
  const call = vi.fn(async (method: string, _param?: unknown) => {
    if (method === "library.get") return state;
    if (method === "console.get") return [];
    if (method === "files.listAll") return { ok: true, value: ["src/App.tsx"] };
    if (method === "settings.get") return { theme: "system" };
    return undefined;
  });
  const bootstrap = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale: "zh-CN",
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  } as BootstrapInfo;
  const bridge = {
    bootstrap,
    call,
    on: (event: string, handler: (payload?: unknown) => void) => {
      events.set(event, handler);
      return () => events.delete(event);
    },
  } as unknown as DesktopBridge;
  const update = vi.fn();
  render(
    <AppFrame bridge={bridge} locale="zh-CN" theme="light" settings={{ settings: null, update }} />,
  );
  return {
    update,
    call,
    emit: (event: string, payload?: unknown) => act(() => events.get(event)?.(payload)),
  };
}

const names = () =>
  screen
    .getAllByRole("option")
    .map((option) => option.textContent?.replace(/[⌘⌃⌥⇧A-Z0-9/]+$/, "").trim());

describe("命令面板在外壳里", () => {
  it("[DESKTOP-EDITOR-64] 资源库页：列出新建项目…、设置、打开运行视图、全部停止、切换侧栏、主题；没有项目命令和编辑器命令", async () => {
    const user = userEvent.setup();
    setup(libraryState());
    await screen.findByRole("navigation", { name: "资源库导航" });
    await user.keyboard("{Meta>}{Shift>}p{/Shift}{/Meta}");
    await screen.findByRole("dialog", { name: "命令面板" });
    expect(names()).toEqual([
      "新建项目…",
      "设置",
      "打开运行视图",
      "全部停止",
      "切换侧栏",
      "主题：浅色",
      "主题：深色",
      "主题：跟随系统",
    ]);
  });

  it("[DESKTOP-EDITOR-73] 资源库页上 ⌘P 不打开浮层", async () => {
    const user = userEvent.setup();
    setup(libraryState());
    await screen.findByRole("navigation", { name: "资源库导航" });
    await user.keyboard("{Meta>}p{/Meta}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("[DESKTOP-EDITOR-61] 项目运行着时有“停止运行”“重启”，没有“运行”；没打开文件所以没有编辑器命令", async () => {
    const user = userEvent.setup();
    setup(projectState());
    await screen.findByRole("group", { name: "运行条" });
    await user.keyboard("{F1}");
    const listed = names();
    expect(listed).toContain("停止运行");
    expect(listed).toContain("重启");
    expect(listed).toContain("刷新预览");
    expect(listed).not.toContain("运行");
    expect(listed).not.toContain("保存");
    expect(listed).not.toContain("查找");
  });

  it("[DESKTOP-EDITOR-61] 项目已停止时有“运行”，没有“停止运行”“重启”", async () => {
    const user = userEvent.setup();
    setup(projectState({ active: false, state: "stopped", status: "stopped", previewUrl: null }));
    await screen.findByRole("group", { name: "运行条" });
    await user.keyboard("{F1}");
    const listed = names();
    expect(listed).toContain("运行");
    expect(listed).not.toContain("停止运行");
    expect(listed).not.toContain("重启");
    expect(listed).not.toContain("刷新预览");
  });

  it("[DESKTOP-EDITOR-62] 从面板执行“在访达中显示”，与工作区“更多”菜单里的同名项一样请求主进程", async () => {
    const user = userEvent.setup();
    const { call } = setup(projectState());
    await screen.findByRole("group", { name: "运行条" });
    await user.keyboard("{F1}");
    await user.keyboard("访达{Enter}");
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith("playground.reveal", "demo"));
    // 菜单里的同名项发的是同一个请求
    call.mockClear();
    await user.click(screen.getByRole("button", { name: "demo 的更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "在访达中显示" }));
    expect(call).toHaveBeenCalledWith("playground.reveal", "demo");
  });

  it("[DESKTOP-EDITOR-62] 全部停止、主题、设置：与按钮、设置页做同样的事；在项目标签页上也能进设置页", async () => {
    const user = userEvent.setup();
    const { call, update } = setup(projectState());
    await screen.findByRole("group", { name: "运行条" });
    await user.keyboard("{F1}");
    await user.keyboard("全部停止{Enter}");
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith("run.stopAll"));
    await user.keyboard("{F1}");
    await user.keyboard("主题：深色{Enter}");
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({ theme: "dark" }));
    await user.keyboard("{F1}");
    await user.keyboard("设置{Enter}");
    await vi.waitFor(() => expect(call).toHaveBeenCalledWith("tab.select", "library"));
  });

  it("[DESKTOP-EDITOR-65] 主进程菜单发 palette.open（焦点在预览里）：命令面板和快速打开都能打开", async () => {
    const { emit } = setup(projectState());
    await screen.findByRole("group", { name: "运行条" });
    emit("palette.open", { mode: "commands" });
    const dialog = await screen.findByRole("dialog", { name: "命令面板" });
    expect(within(dialog).getByRole("combobox")).toBeTruthy();
    emit("palette.open", { mode: "files" });
    expect(await screen.findByRole("dialog", { name: "快速打开" })).toBeTruthy();
  });
});
