// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleLine } from "../../shared/console-state.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import { PreviewPane } from "./PreviewPane.tsx";
import { sampleTab } from "./sample-tab.ts";

beforeEach(() => {
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
  vi.unstubAllGlobals();
});

const stdout = (seq: number, text: string): ConsoleLine => ({
  seq,
  entry: { at: 1_000, kind: "stdout", text },
});

function setup(tab: TabRow, lines: ConsoleLine[] = []) {
  const calls: [string, unknown][] = [];
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: vi.fn(async (method: string, param?: unknown) => {
      calls.push([method, param]);
      return method === "console.get" ? lines : undefined;
    }),
    on: () => () => {},
  } as unknown as DesktopBridge;
  const overlays = new OverlayCounter();
  const view = (next: TabRow) => (
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <PreviewPane bridge={bridge} tab={next} overlays={overlays} />
    </I18nProvider>
  );
  const utils = render(view(tab));
  return { ...utils, calls, rerender: (next: TabRow) => utils.rerender(view(next)) };
}

const starting = (state: TabRow["state"], extra: Partial<TabRow> = {}) =>
  sampleTab({
    name: "react19-4",
    status: "starting",
    state,
    port: null,
    folder: "~/Runyard/react19-4",
    ...extra,
  });

const statusesOf = () =>
  within(screen.getByRole("list", { name: "启动步骤" }))
    .getAllByRole("listitem")
    .map((item) => `${item.getAttribute("data-step")}:${item.getAttribute("data-status")}`);

describe("创建后的启动进度", () => {
  it("[DESKTOP-CREATE-FLOW-14] 预览区依次显示复制、安装、启动、就绪四步，随运行状态推进", () => {
    const { rerender } = setup(starting("checking"));
    expect(screen.getByRole("heading", { name: "正在启动 react19-4" })).toBeTruthy();
    expect(screen.getByText(/放在 ~\/Runyard\/react19-4/)).toBeTruthy();
    const labels = within(screen.getByRole("list", { name: "启动步骤" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(labels[0]).toContain("复制模板文件");
    expect(labels[1]).toContain("安装依赖");
    expect(labels[2]).toContain("启动开发服务");
    expect(labels[3]).toContain("就绪，显示页面");
    expect(statusesOf()).toEqual([
      "copy:done",
      "install:current",
      "start:pending",
      "ready:pending",
    ]);
    rerender(starting("installing"));
    expect(statusesOf()[1]).toBe("install:current");
    rerender(starting("starting", { phaseMs: { copy: 100, install: 300, start: null } }));
    expect(statusesOf()).toEqual(["copy:done", "install:done", "start:current", "ready:pending"]);
    // 完成的步骤写用时，进行中的写“进行中”
    const items = within(screen.getByRole("list", { name: "启动步骤" })).getAllByRole("listitem");
    expect(items[0]?.textContent).toContain("0.1 秒");
    expect(items[1]?.textContent).toContain("0.3 秒");
    expect(items[2]?.textContent).toContain("进行中");
    expect(items[3]?.textContent).not.toMatch(/秒|进行中/);
  });

  it("[DESKTOP-CREATE-FLOW-14] 日志摘要滚动显示最近一行输出，停止启动和查看完整输出都在", async () => {
    const { calls } = setup(starting("starting"), [
      stdout(1, "pnpm install"),
      stdout(2, "VITE v8.3.4  正在预构建依赖…"),
    ]);
    await waitFor(() =>
      expect(
        screen.getByText(
          (_, node) => node?.textContent === "VITE v8.3.4  正在预构建依赖…" && node.tagName === "P",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("pnpm install")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "停止启动" }));
    expect(calls).toContainEqual(["run.stop", "a"]);
    expect(screen.getByRole("button", { name: "查看完整输出" })).toBeTruthy();
  });

  it("[DESKTOP-CREATE-FLOW-14] 就绪后启动进度让位给页面（原生预览视图盖在占位区上）", () => {
    const { rerender, container } = setup(starting("starting"));
    expect(container.querySelector("[data-start-progress]")).not.toBeNull();
    rerender(
      starting("ready", { status: "running", previewUrl: "http://127.0.0.1:7101/", port: 7101 }),
    );
    expect(container.querySelector("[data-start-progress]")).toBeNull();
    expect(container.querySelector("[data-preview-pane]")?.getAttribute("data-screen")).toBe(
      "page",
    );
  });

  it("[DESKTOP-CREATE-FLOW-15] 缺工具时显示缺少运行环境的画面，不是启动进度", () => {
    const { container } = setup(
      starting("failed", {
        status: "crashed",
        active: false,
        failure: { code: "TOOL_MISSING", params: { tool: "node", required: ">=22" } },
      }),
    );
    expect(container.querySelector('[data-failure-screen="missing"]')).not.toBeNull();
    expect(container.querySelector("[data-start-progress]")).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-16] 用得到的工具都在时，启动进度里没有任何关于别的工具的提示", () => {
    const { container } = setup(starting("installing", { name: "html-1" }));
    expect(container.textContent?.toLowerCase()).not.toContain("python");
    expect(container.querySelector("[data-failure-screen]")).toBeNull();
  });
});
