// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FileTabs } from "./FileTabs.tsx";
import { loadingTab } from "./file-tab.ts";

let width = 240;
let observers: (() => void)[] = [];
const paths = Array.from({ length: 8 }, (_, index) => `file-${index}.ts`);
function view(active = paths[7] ?? "", selectedPaths = paths) {
  return (
    <I18nProvider locale="en" platform="darwin" catalogs={desktopCatalogs}>
      <FileTabs
        tabs={selectedPaths.map((path) => loadingTab(path))}
        active={active}
        onSelect={() => {}}
        onClose={() => {}}
      />
    </I18nProvider>
  );
}
beforeEach(() => {
  width = 240;
  observers = [];
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
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute("role") === "tablist" ? width : 0;
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.getAttribute("role") === "tablist" ? 800 : 0;
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const tab = this.querySelector(':scope > button[role="tab"]');
    const viewport = this.closest('[role="tablist"]');
    const index = paths.indexOf(tab?.getAttribute("data-path") ?? "");
    const left =
      this.getAttribute("role") === "tablist"
        ? 50
        : 50 + Math.max(index, 0) * 100 - (viewport?.scrollLeft ?? 0);
    const w = this.getAttribute("role") === "tablist" ? width : 100;
    return {
      x: left,
      y: 10,
      left,
      right: left + w,
      top: 10,
      bottom: 38,
      width: w,
      height: 28,
      toJSON: () => ({}),
    };
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("[DESKTOP-EDITOR-94] 首次恢复末尾标签和缩窄时整个标签可见，只移动自身视口", () => {
  const { rerender } = render(view());
  const viewport = screen.getByRole("tablist");
  expect(viewport.scrollLeft).toBe(560);
  act(() => {
    width = 180;
    for (const callback of observers) callback();
  });
  expect(viewport.scrollLeft).toBe(620);
  rerender(view(paths[0]));
  expect(viewport.scrollLeft).toBe(0);
  expect(document.documentElement.scrollLeft).toBe(0);
});
it("[DESKTOP-EDITOR-93] 普通滚轮和Shift滚轮横向滚，边界也取消默认纵向滚动", () => {
  render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  const wheel = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
  act(() => viewport.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(viewport.scrollLeft).toBe(120);
  fireEvent.wheel(viewport, { deltaY: 80, shiftKey: true });
  expect(viewport.scrollLeft).toBe(200);
  fireEvent.wheel(viewport, { deltaY: 5000 });
  expect(viewport.scrollLeft).toBe(560);
  const boundary = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  act(() => viewport.dispatchEvent(boundary));
  expect(boundary.defaultPrevented).toBe(true);
  expect(viewport.scrollTop).toBe(0);
});
it("[DESKTOP-EDITOR-93] 原生横向手势与缩放不被接管，手动滚动后重绘不拉回", () => {
  const { rerender } = render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  const horizontal = new WheelEvent("wheel", { deltaX: 100, bubbles: true, cancelable: true });
  const zoom = new WheelEvent("wheel", {
    deltaY: 100,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  viewport.dispatchEvent(horizontal);
  viewport.dispatchEvent(zoom);
  expect(horizontal.defaultPrevented).toBe(false);
  expect(zoom.defaultPrevented).toBe(false);
  viewport.scrollLeft = 400;
  fireEvent.scroll(viewport);
  rerender(view(paths[0]));
  expect(viewport.scrollLeft).toBe(400);
});

it("[DESKTOP-EDITOR-93] 同宽ResizeObserver通知不把手动位置拉回", () => {
  render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  viewport.scrollLeft = 400;
  act(() => {
    for (const callback of observers) callback();
  });
  expect(viewport.scrollLeft).toBe(400);
});
it("[DESKTOP-EDITOR-93] 关闭非当前文件不把手动位置拉回", () => {
  const { rerender } = render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  viewport.scrollLeft = 400;
  rerender(view(paths[0], paths.slice(0, -1)));
  expect(viewport.scrollLeft).toBe(400);
});
it("[DESKTOP-EDITOR-94] 键盘聚焦已有文件标签可查看完整名称，不增加额外Tab停点", async () => {
  render(view("src/a-very-long-module.ts", ["src/a-very-long-module.ts"]));
  act(() => screen.getByRole("tab").focus());
  expect(await screen.findByText("src/a-very-long-module.ts")).toBeTruthy();
});

it("[DESKTOP-EDITOR-93] 行和页滚轮单位按自身视口换算，Meta缩放保持原生", () => {
  render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  fireEvent.wheel(viewport, { deltaY: 2, deltaMode: 1 });
  expect(viewport.scrollLeft).toBe(36);
  fireEvent.wheel(viewport, { deltaY: 1, deltaMode: 2 });
  expect(viewport.scrollLeft).toBe(276);
  const zoom = new WheelEvent("wheel", {
    deltaY: 100,
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  viewport.dispatchEvent(zoom);
  expect(zoom.defaultPrevented).toBe(false);
  expect(viewport.scrollLeft).toBe(276);
});

it("[DESKTOP-EDITOR-94] 键盘聚焦文件标签后补全整个item，后续手动滚轮优先", async () => {
  render(view(paths[0]));
  const viewport = screen.getByRole("tablist");
  act(() => screen.getAllByRole("tab")[7]?.focus());
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(viewport.scrollLeft).toBe(560);
  act(() => screen.getAllByRole("tab")[0]?.focus());
  fireEvent.wheel(viewport, { deltaY: -100 });
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(viewport.scrollLeft).toBe(460);
});
