// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { AppFrame } from "./AppFrame.tsx";
import { sampleTab } from "./sample-tab.ts";

// 外壳的版面：侧栏收起与显示范围、项目标签页的可拖面板（规格 DESKTOP-LIBRARY-VIEW-61 至 63、DESKTOP-WORKSPACE-55 至 61）。
// jsdom 不做版面：容器固定 1200 x 700，预览占位区的宽度取自版面写下的 CSS 变量，像真实版面一样跟着拖动变。

const CONTAINER = { width: 1200, height: 700 };
let observers: (() => void)[] = [];

beforeEach(() => {
  observers = [];
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
  return { ...view, call, bridge, emit: (event: string) => act(() => events.get(event)?.()) };
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

  it("[DESKTOP-LIBRARY-VIEW-63] 项目标签页没有侧栏，也没有侧栏按钮；切回资源库，侧栏回来", async () => {
    const user = userEvent.setup();
    setup(projectState());
    await screen.findByRole("separator", { name: "调整文件树宽度" });
    expect(sidebar()).toBeNull();
    expect(screen.queryByRole("button", { name: "收起侧栏" })).toBeNull();
    expect(screen.queryByRole("button", { name: "显示侧栏" })).toBeNull();
    cleanup();
    setup(libraryState());
    expect(await screen.findByRole("navigation", { name: "资源库导航" })).toBeTruthy();
    expect(user).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-62] 在项目标签页按 ⌃⌘S 收起和展开文件树，不动资源库侧栏的状态", async () => {
    const { emit } = setup(projectState());
    await screen.findByRole("separator", { name: "调整文件树宽度" });
    emit("sidebar.toggle");
    expect(await screen.findByRole("button", { name: "展开文件树" })).toBeTruthy();
    expect(screen.queryByRole("tree")).toBeNull();
    emit("sidebar.toggle");
    expect(await screen.findByRole("separator", { name: "调整文件树宽度" })).toBeTruthy();
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

  it("[DESKTOP-WORKSPACE-57] 向上拖输出面板上沿 60 像素，输出面板高 280；脚本项目没有这条分隔条", async () => {
    const { container, unmount } = setup(projectState());
    await handle("调整输出面板高度");
    expect(cssVar(container, "--layout-console-height")).toBe("220px");
    drag(await handle("调整输出面板高度"), "y", 500, 440);
    expect(cssVar(container, "--layout-console-height")).toBe("280px");
    unmount();
    setup(projectState("oneshot"));
    await handle("调整文件树宽度");
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
