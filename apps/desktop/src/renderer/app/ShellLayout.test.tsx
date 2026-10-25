// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
import { sampleTab } from "./sample-tab.ts";

// 外壳的版面：侧栏收起与显示范围、项目标签页的可拖面板（规格 DESKTOP-LIBRARY-VIEW-61 至 63、DESKTOP-WORKSPACE-55 至 61）。
// jsdom 不做版面：容器固定 1440 x 700，预览占位区的宽度取自版面写下的 CSS 变量，像真实版面一样跟着拖动变。

const CONTAINER = { width: 1440, height: 700 };
let observers: (() => void)[] = [];

beforeEach(() => {
  observers = [];
  CONTAINER.width = 1440;
  (Element.prototype as { getAnimations?: () => unknown[] }).getAnimations = () => [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    let width: number = CONTAINER.width;
    const height: number = CONTAINER.height;
    if (this instanceof HTMLElement && this.dataset.previewSlot !== undefined) {
      const inner = this.closest<HTMLElement>("[style*='--pane-preview-width']");
      width = Number.parseFloat(inner?.style.getPropertyValue("--pane-preview-width") ?? "0");
    }
    return {
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    };
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  playgrounds: [],
  ...extra,
});

const projectState = (kind: "server" | "oneshot" = "server") =>
  libraryState({
    tabs: [
      sampleTab({
        id: "demo",
        name: "demo",
        kind,
        previewUrl: kind === "server" ? "http://127.0.0.1:7101/" : null,
        port: kind === "server" ? 7101 : null,
      }),
    ],
    activeTab: "demo",
  });

function setup(state: LibraryState) {
  const events = new Map<string, (payload?: unknown) => void>();
  const call = vi.fn(async (method: string, _param?: unknown) => {
    if (method === "library.get") return state;
    if (method === "template.list") return [];
    return method === "console.get" ? [] : undefined;
  });
  const bootstrap: BootstrapInfo = {
    platform: "darwin",
    windowControls: { side: "left", inset: 72 },
    modKey: "meta",
    locale: "zh-CN",
    theme: "light",
    reducedTransparency: false,
    highContrast: false,
  };
  const bridge = {
    bootstrap,
    call,
    on: (event: string, handler: (payload?: unknown) => void) => {
      events.set(event, handler);
      return () => events.delete(event);
    },
  } as unknown as DesktopBridge;
  const view = render(<AppFrame bridge={bridge} locale="zh-CN" theme="light" />);
  return {
    ...view,
    call,
    bridge,
    emit: (event: string, payload?: unknown) => act(() => events.get(event)?.(payload)),
  };
}

const sidebar = () => screen.queryByRole("navigation", { name: "资源库导航" });
const treeWidth = (container: HTMLElement) =>
  container
    .querySelector<HTMLElement>("[style*='--layout-file-tree-width']")
    ?.style.getPropertyValue("--layout-file-tree-width");
const cssVar = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLElement>(`[style*='${name}']`)?.style.getPropertyValue(name);
const handle = (name: string) => screen.findByRole("separator", { name });

function drag(node: HTMLElement, axis: "x" | "y", from: number, to: number) {
  const point = (value: number) =>
    axis === "x" ? { clientX: value, pointerId: 1 } : { clientY: value, pointerId: 1 };
  fireEvent.pointerDown(node, { button: 0, ...point(from) });
  fireEvent.pointerMove(node, point(to));
  fireEvent.pointerUp(node, point(to));
}

describe("侧栏的收起与显示范围", () => {
  it("[DESKTOP-LIBRARY-VIEW-61] 点顶栏按钮收起侧栏，再点一次回来", async () => {
    const user = userEvent.setup();
    setup(libraryState());
    expect(await screen.findByRole("navigation", { name: "资源库导航" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(sidebar()).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示侧栏" }));
    expect(sidebar()).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-66][DESKTOP-LIBRARY-VIEW-93] 侧栏按钮在侧栏顶部；收起后跟着红绿灯留在顶栏最左边，标签条在它右边；展开后回到侧栏", async () => {
    const user = userEvent.setup();
    setup(libraryState());
    const collapse = await screen.findByRole("button", { name: "收起侧栏" });
    expect(collapse.closest("[data-glass-material='sidebar']")).toBeTruthy();
    await user.click(collapse);
    const expand = screen.getByRole("button", { name: "显示侧栏" });
    expect(expand.closest("[data-glass-material='sidebar']")).toBeNull();
    // 顶栏里：侧栏按钮在标签条前面
    const tabs = screen.getByRole("tablist");
    expect(expand.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(expand.closest("[data-window-toolbar]")).toBe(tabs.closest("[data-window-toolbar]"));
    await user.click(expand);
    expect(screen.queryByRole("button", { name: "显示侧栏" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "收起侧栏" }).closest("[data-glass-material='sidebar']"),
    ).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-61] ⌃⌘S（应用菜单的“切换侧栏”）收起和显示侧栏", async () => {
    const { emit } = setup(libraryState());
    await screen.findByRole("navigation", { name: "资源库导航" });
    emit("sidebar.toggle");
    expect(sidebar()).toBeNull();
    emit("sidebar.toggle");
    expect(sidebar()).toBeTruthy();
  });

  it("[DESKTOP-LIBRARY-VIEW-62] 收起后重新打开应用，侧栏仍是收起的", async () => {
    const user = userEvent.setup();
    const first = setup(libraryState());
    await user.click(await screen.findByRole("button", { name: "收起侧栏" }));
    first.unmount();
    setup(libraryState());
    await screen.findByRole("button", { name: "显示侧栏" });
    expect(sidebar()).toBeNull();
  });

  it("[DESKTOP-LIBRARY-VIEW-63] 项目保留侧栏，跨项目和资源库保持手动收起偏好", async () => {
    const user = userEvent.setup();
    const { emit } = setup(projectState());
    await handle("调整文件树宽度");
    expect(sidebar()).toBeTruthy();
    expect(sidebar()?.querySelector('[aria-current="page"]')).toBeNull();
    await user.click(screen.getByRole("button", { name: "收起侧栏" }));
    expect(sidebar()).toBeNull();
    emit(
      "library.changed",
      libraryState({ tabs: [sampleTab({ id: "other" })], activeTab: "other" }),
    );
    expect(sidebar()).toBeNull();
    expect(screen.getByRole("separator", { name: "调整文件树宽度" })).toBeTruthy();
    emit("library.changed", libraryState());
    expect(sidebar()).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示侧栏" }));
    expect(sidebar()).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-62] 项目页侧栏快捷键及文件树命令互不影响", async () => {
    const { emit } = setup(projectState());
    await handle("调整文件树宽度");
    emit("sidebar.toggle");
    expect(sidebar()).toBeNull();
    expect(screen.getByRole("separator", { name: "调整文件树宽度" })).toBeTruthy();
    emit("command.run", { id: "app.toggleSidebar" });
    expect(sidebar()).toBeTruthy();
    emit("command.run", { id: "app.toggleTree" });
    expect(await screen.findByRole("button", { name: "展开文件树" })).toBeTruthy();
    expect(sidebar()).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem("runyard.layout.v1") ?? "{}").sidebarCollapsed,
    ).toBe(false);
  });
});

describe("项目标签页的可拖面板", () => {
  it("[DESKTOP-WORKSPACE-55] 向右拖文件树右边的分隔条 80 像素，文件树变宽 80", async () => {
    const { container } = setup(projectState());
    await handle("调整文件树宽度");
    expect(treeWidth(container)).toBe("216px");
    drag(await handle("调整文件树宽度"), "x", 300, 380);
    expect(treeWidth(container)).toBe("296px");
  });

  it("[DESKTOP-WORKSPACE-56] 向左拖预览左边的分隔条，预览变宽；脚本项目的输出面板同样可调", async () => {
    const { container, unmount } = setup(projectState());
    await handle("调整预览宽度");
    const before = Number.parseFloat(cssVar(container, "--pane-preview-width") ?? "0");
    drag(await handle("调整预览宽度"), "x", 500, 400);
    expect(Number.parseFloat(cssVar(container, "--pane-preview-width") ?? "0")).toBe(before + 100);
    unmount();
    const script = setup(projectState("oneshot"));
    await handle("调整预览宽度");
    const scriptBefore = Number.parseFloat(cssVar(script.container, "--pane-preview-width") ?? "0");
    drag(await handle("调整预览宽度"), "x", 500, 450);
    expect(Number.parseFloat(cssVar(script.container, "--pane-preview-width") ?? "0")).toBe(
      scriptBefore + 50,
    );
    expect(document.querySelector("[data-script-output]")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-57] 向上拖输出面板上沿 60 像素，输出面板高 280；脚本项目底部也有这个面板（设计稿 Script 的终端）", async () => {
    const { container, unmount } = setup(projectState());
    await handle("调整输出面板高度");
    expect(cssVar(container, "--layout-console-height")).toBe("220px");
    drag(await handle("调整输出面板高度"), "y", 500, 440);
    expect(cssVar(container, "--layout-console-height")).toBe("280px");
    unmount();
    setup(projectState("oneshot"));
    await handle("调整文件树宽度");
    // 脚本没开终端时底部是一行标题条，没有可拖的高度
    expect(screen.queryByRole("separator", { name: "调整输出面板高度" })).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-58] 一直往一个方向拖，停在最小尺寸，不会消失", async () => {
    const { container } = setup(projectState());
    drag(await handle("调整文件树宽度"), "x", 300, -5000);
    expect(treeWidth(container)).toBe("160px");
    drag(await handle("调整输出面板高度"), "y", 300, 5000);
    expect(cssVar(container, "--layout-console-height")).toBe("96px");
    drag(await handle("调整预览宽度"), "x", 300, 5000);
    expect(cssVar(container, "--pane-preview-width")).toBe("280px");
  });

  it("[DESKTOP-WORKSPACE-59] 双击分隔条恢复默认尺寸", async () => {
    const { container } = setup(projectState());
    drag(await handle("调整文件树宽度"), "x", 300, 400);
    drag(await handle("调整输出面板高度"), "y", 500, 300);
    expect(treeWidth(container)).not.toBe("216px");
    fireEvent.doubleClick(await handle("调整文件树宽度"));
    fireEvent.doubleClick(await handle("调整输出面板高度"));
    expect(treeWidth(container)).toBe("216px");
    expect(cssVar(container, "--layout-console-height")).toBe("220px");
  });

  it("[DESKTOP-WORKSPACE-60] 收起文件树后只剩展开按钮，再点回来；收起和拖过的尺寸重新打开应用后还在", async () => {
    const user = userEvent.setup();
    const first = setup(projectState());
    drag(await handle("调整输出面板高度"), "y", 500, 440);
    await user.click(await screen.findByRole("button", { name: "收起文件树" }));
    expect(screen.queryByRole("tree")).toBeNull();
    expect(screen.queryByRole("separator", { name: "调整文件树宽度" })).toBeNull();
    first.unmount();
    const second = setup(projectState());
    expect(await screen.findByRole("button", { name: "展开文件树" })).toBeTruthy();
    expect(cssVar(second.container, "--layout-console-height")).toBe("280px");
    await user.click(screen.getByRole("button", { name: "展开文件树" }));
    expect(await screen.findByRole("separator", { name: "调整文件树宽度" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-61] 拖动时预览占位区的每一次变化都报给主进程，最后停在拖到的位置", async () => {
    const { call, container } = setup(projectState());
    const separator = await handle("调整预览宽度");
    const boundsCalls = () =>
      call.mock.calls.filter(([method, bounds]) => method === "preview.bounds" && bounds !== null);
    const widths = () => boundsCalls().map(([, bounds]) => (bounds as { width: number }).width);
    // 第一次画用的是量不到容器时的备用尺寸；让量到的 1440 宽生效后，占位区才报出稳定的初始宽度
    act(() => {
      for (const notify of observers) notify();
    });
    const start = Number.parseFloat(cssVar(container, "--pane-preview-width") ?? "0");
    expect(widths().at(-1)).toBe(start);
    // 一边拖一边让版面“生效”：真实环境里占位区的 ResizeObserver 在每一帧都会触发
    fireEvent.pointerDown(separator, { button: 0, clientX: 600, pointerId: 1 });
    for (const x of [580, 540, 500]) {
      fireEvent.pointerMove(separator, { clientX: x, pointerId: 1 });
      act(() => {
        for (const notify of observers) notify();
      });
    }
    fireEvent.pointerUp(separator, { clientX: 500, pointerId: 1 });
    expect(widths().at(-1)).toBe(start + 100);
    expect(new Set(widths()).size).toBeGreaterThanOrEqual(4);
    // 先于每次 bounds 之前没有把视图藏起来：拖动期间视图一直可见
    expect(
      call.mock.calls.some(([method, value]) => method === "preview.visible" && value === false),
    ).toBe(false);
  });

  it("方向键也能调整分隔条，回车恢复默认", async () => {
    const { container } = setup(projectState());
    const separator = await handle("调整文件树宽度");
    separator.focus();
    await userEvent.setup().keyboard("{ArrowRight}{ArrowRight}");
    expect(treeWidth(container)).toBe("248px");
    await userEvent.setup().keyboard("{Enter}");
    expect(treeWidth(container)).toBe("216px");
  });
});

function resizeShell(width: number) {
  act(() => {
    CONTAINER.width = width;
    for (const notify of observers) notify();
  });
}
it("[DESKTOP-LIBRARY-VIEW-97] [DESKTOP-LIBRARY-VIEW-67] 自动隐藏只移动侧栏内焦点，不改手动偏好", async () => {
  setup(
    libraryState({
      playgrounds: [
        {
          id: "test",
          name: "test",
          path: "/lib/test",
          kind: "server",
          state: "idle",
          active: false,
          previewing: false,
          busy: false,
          note: "",
          templateId: "html",
          templateName: null,
          port: null,
          autoClean: { enabled: false, days: null },
          lastUsedAt: 1,
          lastOpenedAt: 1,
          createdBy: { kind: "user" },
          createdAt: 1,
          missing: false,
        },
      ],
    }),
  );
  const nav = await screen.findByRole("navigation", { name: "资源库导航" });
  nav.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
  resizeShell(1024);
  expect(sidebar()).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "显示侧栏" }));
  expect(window.localStorage.getItem("runyard.layout.v1")).toBeNull();
  resizeShell(1440);
  const search = screen.getByRole("textbox", { name: "搜索项目" });
  search.focus();
  resizeShell(720);
  expect(document.activeElement).toBe(search);
  const table = screen.getByRole("table", { name: "项目列表" });
  table.focus();
  resizeShell(900);
  expect(document.activeElement).toBe(table);
});
it("[DESKTOP-LIBRARY-VIEW-98] 自动收起后1100恢复，手动收起偏好跨宽度和重开保留", async () => {
  const user = userEvent.setup();
  let view = setup(libraryState({ loaded: false }));
  await screen.findByRole("navigation", { name: "资源库导航" });
  resizeShell(720);
  expect(sidebar()).toBeNull();
  resizeShell(1100);
  expect(sidebar()).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "收起侧栏" }));
  const saved = window.localStorage.getItem("runyard.layout.v1");
  resizeShell(720);
  resizeShell(1440);
  expect(sidebar()).toBeNull();
  expect(window.localStorage.getItem("runyard.layout.v1")).toBe(saved);
  view.unmount();
  view = setup(libraryState({ loaded: false }));
  await screen.findByRole("button", { name: "显示侧栏" });
  expect(sidebar()).toBeNull();
});
it("[DESKTOP-LIBRARY-VIEW-99] 覆盖侧栏按钮与快捷键可开关，分类和Esc收回并归还焦点", async () => {
  const user = userEvent.setup();
  const { container, emit } = setup(libraryState({ loaded: false }));
  await screen.findByRole("navigation", { name: "资源库导航" });
  resizeShell(720);
  await user.click(screen.getByRole("button", { name: "显示侧栏" }));
  expect(container.querySelector("[data-sidebar-overlay]")).toBeTruthy();
  expect(document.activeElement).toBe(sidebar()?.querySelector('[aria-current="page"]'));
  await user.keyboard("{Escape}");
  expect(sidebar()).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "显示侧栏" }));
  emit("sidebar.toggle");
  await user.click(screen.getByRole("button", { name: /自动清理/ }));
  expect(sidebar()).toBeNull();
  expect(window.localStorage.getItem("runyard.layout.v1")).toBeNull();
});

it("[DESKTOP-LIBRARY-VIEW-98] 收起偏好的临时侧栏拉宽后焦点返回切换按钮", async () => {
  window.localStorage.setItem("runyard.layout.v1", JSON.stringify({ sidebarCollapsed: true }));
  const { emit } = setup(libraryState({ loaded: false }));
  await screen.findByRole("button", { name: "显示侧栏" });
  resizeShell(720);
  emit("sidebar.toggle");
  expect(sidebar()).toBeTruthy();
  resizeShell(1440);
  expect(sidebar()).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "显示侧栏" }));
});
it("[DESKTOP-LIBRARY-VIEW-99] 收起偏好从临时侧栏进入模板仍保留原导航，不写偏好", async () => {
  window.localStorage.setItem("runyard.layout.v1", JSON.stringify({ sidebarCollapsed: true }));
  const saved = window.localStorage.getItem("runyard.layout.v1");
  const user = userEvent.setup();
  const { emit } = setup(libraryState({ loaded: false }));
  await screen.findByRole("button", { name: "显示侧栏" });
  resizeShell(720);
  emit("sidebar.toggle");
  await user.click(screen.getByRole("button", { name: /^模板/ }));
  expect(sidebar()).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "收起侧栏" }));
  expect(screen.getByRole("heading", { name: "模板" })).toBeTruthy();
  expect(sidebar()).toBeNull();
  await user.click(screen.getByRole("button", { name: "显示侧栏" }));
  expect(sidebar()).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /^全部/ }));
  expect(sidebar()).toBeNull();
  expect(window.localStorage.getItem("runyard.layout.v1")).toBe(saved);
});

it("[DESKTOP-LIBRARY-VIEW-98] 从临时模板导航打开项目再回库不遗留展开状态", async () => {
  window.localStorage.setItem("runyard.layout.v1", JSON.stringify({ sidebarCollapsed: true }));
  const user = userEvent.setup();
  const { emit } = setup(libraryState({ loaded: false }));
  await screen.findByRole("button", { name: "显示侧栏" });
  resizeShell(720);
  emit("sidebar.toggle");
  await user.click(screen.getByRole("button", { name: /^模板/ }));
  emit("library.changed", projectState());
  emit("library.changed", libraryState({ loaded: false }));
  resizeShell(1440);
  expect(sidebar()).toBeNull();
  expect(
    JSON.parse(window.localStorage.getItem("runyard.layout.v1") ?? "{}").sidebarCollapsed,
  ).toBe(true);
});

it.each([1100, 1440])(
  "[DESKTOP-LIBRARY-VIEW-98] 拉宽到%s后切换按钮焦点随侧栏恢复",
  async (width) => {
    setup(libraryState({ loaded: false }));
    await screen.findByRole("navigation", { name: "资源库导航" });
    resizeShell(720);
    screen.getByRole("button", { name: "显示侧栏" }).focus();
    resizeShell(width);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "收起侧栏" }));
  },
);

it.each(["reopen", "return"])(
  "[DESKTOP-LIBRARY-VIEW-99] 临时模板导航%s时不丢焦点",
  async (action) => {
    window.localStorage.setItem("runyard.layout.v1", JSON.stringify({ sidebarCollapsed: true }));
    const user = userEvent.setup();
    const { emit } = setup(libraryState({ loaded: false }));
    await screen.findByRole("button", { name: "显示侧栏" });
    resizeShell(720);
    emit("sidebar.toggle");
    await user.click(screen.getByRole("button", { name: /^模板/ }));
    if (action === "reopen") {
      await user.click(screen.getByRole("button", { name: "收起侧栏" }));
      await user.click(screen.getByRole("button", { name: "显示侧栏" }));
      expect(document.activeElement).toBe(sidebar()?.querySelector('[aria-current="page"]'));
    } else {
      await user.click(screen.getByRole("button", { name: /^全部/ }));
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "显示侧栏" }));
    }
  },
);

it("[DESKTOP-LIBRARY-VIEW-97] 展开偏好从临时模板拉宽回库后不遗留焦点请求", async () => {
  const user = userEvent.setup();
  const { emit } = setup(
    libraryState({
      playgrounds: [
        {
          id: "focus",
          name: "focus",
          path: "/lib/focus",
          kind: "server",
          state: "idle",
          active: false,
          previewing: false,
          busy: false,
          note: "",
          templateId: "html",
          templateName: null,
          port: null,
          autoClean: { enabled: false, days: null },
          lastUsedAt: 1,
          lastOpenedAt: 1,
          createdBy: { kind: "user" },
          createdAt: 1,
          missing: false,
        },
      ],
    }),
  );
  await screen.findByRole("navigation", { name: "资源库导航" });
  resizeShell(720);
  emit("sidebar.toggle");
  await user.click(screen.getByRole("button", { name: /^模板/ }));
  resizeShell(1440);
  await user.click(screen.getByRole("button", { name: /^全部/ }));
  const search = screen.getByRole("textbox", { name: "搜索项目" });
  search.focus();
  resizeShell(720);
  expect(document.activeElement).toBe(search);
});

it("[DESKTOP-LIBRARY-VIEW-99] 项目临时侧栏聚焦首项，原生预览让位并在关闭后恢复", async () => {
  const { call, emit } = setup({ ...projectState(), loaded: false });
  await handle("调整预览宽度");
  resizeShell(720);
  call.mockClear();
  emit("sidebar.toggle");
  expect(document.activeElement).toBe(sidebar()?.querySelector("button"));
  expect(sidebar()?.querySelector('[aria-current="page"]')).toBeNull();
  await waitFor(() => expect(call).toHaveBeenCalledWith("preview.visible", false));
  call.mockClear();
  await userEvent.setup().keyboard("{Escape}");
  expect(sidebar()).toBeNull();
  await waitFor(() => expect(call).toHaveBeenCalledWith("preview.visible", true));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "显示侧栏" }));
  expect(window.localStorage.getItem("runyard.layout.v1")).toBeNull();
});

it("[DESKTOP-LIBRARY-VIEW-64] 项目侧栏进入模板，回库状态推送不覆盖页面且不停止项目", async () => {
  const state = { ...projectState(), loaded: false };
  const { emit, call } = setup(state);
  await handle("调整文件树宽度");
  await userEvent.setup().click(screen.getByRole("button", { name: /^模板/ }));
  expect(call).toHaveBeenCalledWith("tab.select", "library");
  emit("library.changed", { ...state, activeTab: "library" });
  expect(await screen.findByRole("heading", { name: "模板" })).toBeTruthy();
  expect(sidebar()).toBeTruthy();
  expect(call.mock.calls.some(([method]) => method === "run.stop" || method === "tab.close")).toBe(
    false,
  );
});

it("[DESKTOP-LIBRARY-VIEW-64] 项目侧栏筛选直接回库，不关闭标签或停止运行", async () => {
  const state = { ...projectState(), loaded: false };
  const { emit, call } = setup(state);
  await handle("调整文件树宽度");
  await userEvent.setup().click(screen.getByRole("button", { name: /^智能体创建/ }));
  expect(call).toHaveBeenCalledWith("tab.select", "library");
  emit("library.changed", { ...state, activeTab: "library" });
  expect(await screen.findByRole("heading", { name: "智能体创建" })).toBeTruthy();
  expect(screen.getByRole("tab", { name: /demo/ }).getAttribute("aria-selected")).toBe("false");
  expect(call.mock.calls.some(([method]) => method === "run.stop" || method === "tab.close")).toBe(
    false,
  );
});

describe("项目页版面（UI 走查 W1 至 W7）", () => {
  it("[DESKTOP-WORKSPACE-72] 1100 宽进入项目页：全局侧栏默认收起，可临时展开，不改手动偏好", async () => {
    const user = userEvent.setup();
    CONTAINER.width = 1100;
    setup(projectState());
    await handle("调整文件树宽度");
    expect(sidebar()).toBeNull();
    expect(window.localStorage.getItem("runyard.layout.v1")).toBeNull();
    await user.click(screen.getByRole("button", { name: "显示侧栏" }));
    expect(sidebar()).toBeTruthy();
    expect(window.localStorage.getItem("runyard.layout.v1")).toBeNull();
    // 编辑器最窄 420：预览不会把它挤到更窄
    const tree = Number.parseFloat(treeWidth(document.body) ?? "0");
    const preview = Number.parseFloat(cssVar(document.body, "--pane-preview-width") ?? "0");
    expect(1100 - tree - preview - 2 * 12).toBeGreaterThanOrEqual(420);
    // 宽窗口照手动偏好常驻
    resizeShell(1440);
    expect(sidebar()).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-73] 项目页卡片间用工作区底色，资源库页不用", async () => {
    const { container, emit } = setup(projectState());
    await handle("调整文件树宽度");
    const shell = () => container.querySelector<HTMLElement>("[data-surface]");
    expect(shell()?.getAttribute("data-surface")).toBe("workspace");
    emit("library.changed", libraryState());
    expect(container.querySelector("[data-surface]")).toBeNull();
  });

  it("[DESKTOP-WORKSPACE-74] 全局侧栏开关和文件树开关用不同的图案", async () => {
    setup(projectState());
    await handle("调整文件树宽度");
    const global = screen.getByRole("button", { name: "收起侧栏" });
    const tree = screen.getByRole("button", { name: "收起文件树" });
    expect(global.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe("sidebar-left");
    expect(tree.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe("chevrons-left");
  });
});
