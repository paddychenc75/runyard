// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "../App.tsx";
import { sampleTab } from "../sample-tab.ts";
import { library, world } from "./settings-world.ts";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it("[DESKTOP-SETTINGS-47] 720宽自动隐藏侧栏后顶部项目和资源库入口仍可退出设置", async () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 720, 760));
  const w = setup({ ...library, tabs: [sampleTab({ id: "demo", name: "demo", entry: null })] });
  await screen.findByRole("tab", { name: /demo/ });
  await userEvent.setup().click(screen.getByRole("button", { name: "显示侧栏" }));
  expect(screen.getByRole("navigation")).toBeTruthy();
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  expect(screen.queryByRole("navigation")).toBeNull();
  await userEvent.setup().click(screen.getByRole("tab", { name: /demo/ }));
  expect(w.calls).toContainEqual({ method: "tab.select", param: "demo" });
  expect(screen.queryByRole("heading", { level: 1, name: "设置" })).toBeNull();
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  await userEvent.setup().click(screen.getByRole("button", { name: "显示侧栏" }));
  await userEvent.setup().click(screen.getByRole("button", { name: /^全部/ }));
  expect(screen.queryByRole("heading", { level: 1, name: "设置" })).toBeNull();
});

function setup(initial = library) {
  const w = world({ on: { "library.get": () => ({ ...initial, loaded: false }) } });
  render(<App bridge={w.bridge} />);
  return w;
}

it("[DESKTOP-SETTINGS-01] 侧栏设置在同一外壳中显示并保留顶部标签", async () => {
  setup();
  await userEvent.setup().click(await screen.findByRole("button", { name: "设置" }));
  expect(await screen.findByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
  expect(screen.getByRole("tablist")).toBeTruthy();
});

it("[DESKTOP-SETTINGS-46] 原项目关闭后即使相邻项目成为活动项仍留设置，⌘W回资源库", async () => {
  const initial = {
    ...library,
    activeTab: "first",
    tabs: [
      sampleTab({ id: "first", name: "first", entry: null }),
      sampleTab({ id: "second", name: "second", entry: null }),
    ],
  };
  const w = setup(initial);
  await screen.findByRole("tab", { name: /first/ });
  act(() => w.emit("command.run", { id: "app.settings" }));
  const heading = await screen.findByRole("heading", { level: 1, name: "设置" });
  act(() =>
    w.emit("library.changed", { ...initial, activeTab: "second", tabs: initial.tabs.slice(1) }),
  );
  expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBe(heading);
  act(() => w.emit("command.run", { id: "app.closeTab" }));
  expect(w.calls).toContainEqual({ method: "tab.select", param: "library" });
  expect(w.calls.some(({ method }) => method === "tab.close")).toBe(false);
});

it("[DESKTOP-SETTINGS-45] 显式再次打开同一项目的序号让设置退出，普通状态更新不退出", async () => {
  const initial = {
    ...library,
    activeTab: "demo",
    tabs: [sampleTab({ id: "demo", name: "demo", entry: null })],
  };
  const w = setup(initial);
  await screen.findByRole("tab", { name: /demo/ });
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  act(() => w.emit("library.changed", { ...initial }));
  expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
  act(() => w.emit("library.changed", { ...initial, projectSelection: 1 }));
  expect(screen.queryByRole("heading", { level: 1, name: "设置" })).toBeNull();
});

it("[DESKTOP-SETTINGS-37] 重复设置命令保留同一页面与滚动位置", async () => {
  const w = setup();
  await screen.findByRole("button", { name: "设置" });
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  const viewport = document.getElementById("settings-viewport") as HTMLElement;
  viewport.scrollTop = 120;
  act(() => w.emit("command.run", { id: "app.settings" }));
  expect(document.getElementById("settings-viewport")).toBe(viewport);
  expect(viewport.scrollTop).toBe(120);
});

it("[DESKTOP-SETTINGS-46] 资源库进入设置后⌘W只返回资源库", async () => {
  const w = setup();
  await screen.findByRole("button", { name: "设置" });
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  fireEvent.keyDown(window, { key: "w", metaKey: true });
  expect(screen.queryByRole("heading", { level: 1, name: "设置" })).toBeNull();
  expect(screen.getByRole("tablist")).toBeTruthy();
  expect(w.calls.filter(({ method }) => method === "tab.close" || method === "run.stop")).toEqual(
    [],
  );
});

it("[DESKTOP-SETTINGS-45] 设置中创建或打开另一项目后显示新工作区", async () => {
  const w = setup();
  await screen.findByRole("button", { name: "设置" });
  act(() => w.emit("command.run", { id: "app.settings" }));
  await screen.findByRole("heading", { level: 1, name: "设置" });
  act(() =>
    w.emit("library.changed", {
      ...library,
      loaded: false,
      activeTab: "new-project",
      projectSelection: 1,
      tabs: [sampleTab({ id: "new-project", name: "new-project", entry: null })],
    }),
  );
  expect(screen.queryByRole("heading", { level: 1, name: "设置" })).toBeNull();
  expect(screen.getByRole("tab", { name: /new-project/, selected: true })).toBeTruthy();
});
