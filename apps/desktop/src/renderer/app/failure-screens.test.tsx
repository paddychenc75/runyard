// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleLine } from "../../shared/console-state.ts";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import { ConsolePanel } from "./ConsolePanel.tsx";
import { previewScreenOf } from "./failure-view.ts";
import { PreviewPane } from "./PreviewPane.tsx";
import { RunBar } from "./RunBar.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const line = (seq: number, text: string, kind: "stdout" | "stderr" = "stdout"): ConsoleLine => ({
  seq,
  entry: { at: 1_000, kind, text },
});

function setup(row: TabRow, lines: ConsoleLine[] = []) {
  return setupWith(row, {}, lines);
}

function setupWith(row: TabRow, answers: Record<string, unknown>, lines: ConsoleLine[] = []) {
  const calls: [string, unknown][] = [];
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: vi.fn(async (method: string, param?: unknown) => {
      calls.push([method, param]);
      if (method in answers) return answers[method];
      return method === "console.get" ? lines : undefined;
    }),
    on: () => () => {},
  } as unknown as DesktopBridge;
  const overlays = new OverlayCounter();
  const view = (next: TabRow) => (
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <RunBar bridge={bridge} tab={next} />
      <PreviewPane bridge={bridge} tab={next} overlays={overlays} />
      <ConsolePanel bridge={bridge} tab={next} />
    </I18nProvider>
  );
  const utils = render(view(row));
  return { ...utils, calls, view: utils, rerender: (next: TabRow) => utils.rerender(view(next)) };
}

const missing = (extra: Record<string, unknown> = {}): TabRow =>
  sampleTab({
    status: "crashed",
    state: "failed",
    active: false,
    port: null,
    failure: {
      code: "TOOL_MISSING",
      params: {
        tool: "go",
        required: ">=1.22 <2",
        installCommand: "brew install go",
        installUrl: "https://go.dev/dl/",
        ...extra,
      },
    },
  });

describe("缺少运行环境", () => {
  it("[DESKTOP-WORKSPACE-18] 写明缺哪个工具、需要的版本、当前没装、安装命令和官网，有“复制命令”和“重新检测”", () => {
    setup(missing());
    const pane = screen.getByText("没有找到 go").closest("[data-failure-screen]") as HTMLElement;
    const view = within(pane);
    expect(view.getByText("go >=1.22 <2")).toBeTruthy();
    expect(view.getByText("未安装")).toBeTruthy();
    expect(view.getByText("brew install go")).toBeTruthy();
    expect(view.getByRole("button", { name: "go.dev/dl" })).toBeTruthy();
    expect(view.getByRole("button", { name: "复制命令" })).toBeTruthy();
    expect(view.getByRole("button", { name: "重新检测" })).toBeTruthy();
    // 运行条同样写明缺什么，主按钮也是“重新检测”
    expect(within(screen.getByRole("group", { name: "运行条" })).getByText("缺少 go")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-18] “复制命令”把命令交给主进程放进剪贴板，从不执行；官网用系统浏览器打开", async () => {
    const { calls } = setup(missing());
    fireEvent.click(screen.getByRole("button", { name: "复制命令" }));
    expect(calls).toContainEqual(["clipboard.copy", "brew install go"]);
    expect(await screen.findByRole("button", { name: "已复制" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "go.dev/dl" }));
    expect(calls).toContainEqual(["link.open", "https://go.dev/dl/"]);
    expect(calls.map(([method]) => method)).not.toContain("run.start");
  });

  it("[DESKTOP-WORKSPACE-18] “重新检测”就是再启动一次", () => {
    const { calls } = setup(missing());
    const pane = screen.getByText("没有找到 go").closest("[data-failure-screen]") as HTMLElement;
    fireEvent.click(within(pane).getByRole("button", { name: "重新检测" }));
    expect(calls).toContainEqual(["run.start", "a"]);
  });

  it("[DESKTOP-SETTINGS-17] “已经装了？指定路径…”和设置页是同一个入口：选的文件被接受后再启动一次", async () => {
    const { calls, view } = setupWith(missing(), { "toolchain.pickPath": { status: "set" } });
    const pane = within(
      view.getByText("没有找到 go").closest("[data-failure-screen]") as HTMLElement,
    );
    fireEvent.click(pane.getByRole("button", { name: "指定路径…" }));
    await waitFor(() => expect(calls).toContainEqual(["run.start", "a"]));
    expect(calls).toContainEqual(["toolchain.pickPath", "go"]);
  });

  it("[DESKTOP-SETTINGS-18] 选的文件不是可用的工具：写明，不再启动", async () => {
    const { calls, view } = setupWith(missing(), {
      "toolchain.pickPath": { status: "invalid", tool: "go", path: "/x" },
    });
    const pane = within(
      view.getByText("没有找到 go").closest("[data-failure-screen]") as HTMLElement,
    );
    fireEvent.click(pane.getByRole("button", { name: "指定路径…" }));
    expect((await pane.findByRole("alert")).textContent).toBe(
      "这个文件不是可用的 go，原来的路径没有改",
    );
    expect(calls.map(([method]) => method)).not.toContain("run.start");
  });

  it("[DESKTOP-WORKSPACE-18] 版本过低显示当前版本；模板没写安装命令时不放命令和复制按钮", () => {
    setup(
      sampleTab({
        state: "failed",
        active: false,
        failure: {
          code: "TOOL_TOO_OLD",
          params: { tool: "node", required: ">=20", found: "18.2.0" },
        },
      }),
    );
    expect(screen.getByText("node 的版本过低")).toBeTruthy();
    expect(screen.getByText("18.2.0")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "复制命令" })).toBeNull();
    expect(screen.queryByText("安装命令")).toBeNull();
  });
});

describe("依赖安装失败", () => {
  const failed = (code: "SETUP_FAILED" | "DEPS_OFFLINE" | "RUN_FAILED") =>
    sampleTab({
      state: "failed",
      status: "crashed",
      active: false,
      failure: { code, params: { name: "react-counter" } },
    });

  it("[DESKTOP-WORKSPACE-19] 启动清单停在“安装依赖”并标红，显示输出的最后几行，有“重试”和“查看完整输出”", async () => {
    const lines = Array.from({ length: 20 }, (_, index) => line(index + 1, `out-${index + 1}`));
    lines.push(line(21, "ERR_PNPM_NO_MATCHING_VERSION", "stderr"));
    const { calls, container } = setup(failed("SETUP_FAILED"), lines);
    const steps = screen.getByRole("list", { name: "启动步骤" });
    const status = within(steps)
      .getAllByRole("listitem")
      .map((item) => [item.textContent, item.getAttribute("data-status")]);
    expect(status).toEqual([
      ["复制模板文件", "done"],
      ["安装依赖", "failed"],
      ["启动开发服务", "pending"],
      ["就绪，显示页面", "pending"],
    ]);
    // 只给最后几行：第 1 行已经不在摘要里，最后一行在
    const summary = container.querySelector("[data-failure-screen=start-failed]") as HTMLElement;
    await waitFor(() =>
      expect(within(summary).getByText("ERR_PNPM_NO_MATCHING_VERSION")).toBeTruthy(),
    );
    expect(within(summary).queryByText("out-1")).toBeNull();
    expect(within(summary).getByText("out-20")).toBeTruthy();
    fireEvent.click(within(summary).getByRole("button", { name: "重试" }));
    expect(calls).toContainEqual(["run.start", "a"]);
    expect(within(summary).getByRole("button", { name: "查看完整输出" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-19] “查看完整输出”把焦点带到控制台的输出区", () => {
    const { container } = setup(failed("SETUP_FAILED"));
    fireEvent.click(screen.getByRole("button", { name: "查看完整输出" }));
    expect(document.activeElement).toBe(container.querySelector("[data-console] [role=log]"));
  });

  it("[DESKTOP-WORKSPACE-19] 离线没有缓存同样停在“安装依赖”，文字来自错误码；进程在就绪前退出停在“启动开发服务”", () => {
    const { rerender } = setup(failed("DEPS_OFFLINE"));
    expect(screen.getByText(/离线且依赖未缓存/)).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "启动步骤" }))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-status")),
    ).toEqual(["done", "failed", "pending", "pending"]);
    rerender(failed("RUN_FAILED"));
    expect(
      within(screen.getByRole("list", { name: "启动步骤" }))
        .getAllByRole("listitem")
        .map((item) => item.getAttribute("data-status")),
    ).toEqual(["done", "done", "failed", "pending"]);
  });
});

describe("启动较慢", () => {
  const slow = sampleTab({ state: "starting", status: "starting", active: true, slow: true });

  it("[DESKTOP-WORKSPACE-20] 状态写“启动中（较慢）”，不出现失败画面，只有“停止”和“查看输出”", () => {
    const { calls, container } = setup(slow);
    expect(
      within(screen.getByRole("group", { name: "运行条" })).getByText("启动中（较慢）"),
    ).toBeTruthy();
    const screenEl = container.querySelector("[data-failure-screen=slow]") as HTMLElement;
    expect(screenEl).not.toBeNull();
    expect(container.querySelector("[data-failure-screen=start-failed]")).toBeNull();
    expect(container.querySelector("[data-failure-screen=missing]")).toBeNull();
    expect(container.querySelector("[data-failure-screen=crashed]")).toBeNull();
    fireEvent.click(within(screenEl).getByRole("button", { name: "停止" }));
    expect(calls).toContainEqual(["run.stop", "a"]);
    expect(within(screenEl).getByRole("button", { name: "查看完整输出" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-20] 没满 30 秒时是普通的启动进度，状态是“启动中”", () => {
    setup(sampleTab({ state: "starting", status: "starting", active: true, slow: false }));
    expect(screen.getByRole("heading", { name: "正在启动 react-counter" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "运行条" })).getByText("启动中")).toBeTruthy();
  });
});

describe("运行中崩溃", () => {
  const crashed = (extra: Partial<TabRow> = {}) =>
    sampleTab({
      state: "crashed",
      status: "crashed",
      active: false,
      exitCode: 1,
      port: null,
      lastFrame: "data:image/png;base64,LAST",
      ...extra,
    });

  it("[DESKTOP-WORKSPACE-21] 保留最后一帧并盖一层提示，写明退出码，有“重新运行”和“查看完整输出”", () => {
    const { calls, container } = setup(crashed());
    const frame = container.querySelector("[data-preview-frame]") as HTMLImageElement;
    expect(frame.getAttribute("src")).toBe("data:image/png;base64,LAST");
    const notice = screen.getByRole("alert", { name: "崩溃提示" });
    expect(within(notice).getByText("已崩溃 · 退出码 1")).toBeTruthy();
    fireEvent.click(within(notice).getByRole("button", { name: "重新运行" }));
    expect(calls).toContainEqual(["run.start", "a"]);
    expect(within(notice).getByRole("button", { name: "查看完整输出" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-21] 没有最后一帧（启动时就崩溃）也有提示；被信号结束没有退出码时只写“已崩溃”", () => {
    const { container } = setup(crashed({ lastFrame: null, exitCode: null }));
    expect(container.querySelector("[data-preview-frame]")).toBeNull();
    const notice = screen.getByRole("alert", { name: "崩溃提示" });
    expect(within(notice).getByRole("heading", { name: "已崩溃" })).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-21] 显示最后几行日志，重新运行后提示消失", async () => {
    const { rerender } = setup(crashed(), [
      line(1, "Ready in 612ms"),
      line(2, "TypeError: Cannot read properties", "stderr"),
    ]);
    const notice = screen.getByRole("alert", { name: "崩溃提示" });
    await waitFor(() =>
      expect(within(notice).getByText("TypeError: Cannot read properties")).toBeTruthy(),
    );
    rerender(sampleTab({ state: "starting", status: "starting", active: true }));
    expect(screen.queryByRole("alert", { name: "崩溃提示" })).toBeNull();
  });
});

describe("端口自动改用", () => {
  const moved = sampleTab({
    port: 7112,
    previewUrl: "http://127.0.0.1:7112/",
    portFallback: {
      wanted: 7111,
      actual: 7112,
      reason: "PORT_OCCUPIED",
      occupant: { pid: 48213, name: "node" },
    },
  });

  it("[DESKTOP-WORKSPACE-22] 预览区上方说明原端口被谁占用、现在用的端口；不是失败，页面照常显示", () => {
    const { container } = setup(moved);
    const banner = container.querySelector("[data-port-changed]") as HTMLElement;
    expect(within(banner).getByText("7111 端口被占用")).toBeTruthy();
    expect(within(banner).getByText("已改用 7112 端口。")).toBeTruthy();
    expect(within(banner).getByText("占用者：node（PID 48213）")).toBeTruthy();
    expect(container.querySelector("[data-failure-screen]")).toBeNull();
    expect(container.querySelector("[data-preview-pane]")?.getAttribute("data-screen")).toBe(
      "page",
    );
  });

  it("[DESKTOP-WORKSPACE-22] 被系统保留时这样说；查不到占用者就不写占用者；“知道了”收起说明", () => {
    const { container } = setup({
      ...moved,
      portFallback: { wanted: 80, actual: 7112, reason: "PORT_RESERVED", occupant: null },
    });
    const banner = container.querySelector("[data-port-changed]") as HTMLElement;
    expect(within(banner).getByText("80 端口被系统保留")).toBeTruthy();
    expect(within(banner).queryByText(/占用者：/)).toBeNull();
    act(() => {
      fireEvent.click(within(banner).getByRole("button", { name: "知道了" }));
    });
    expect(container.querySelector("[data-port-changed]")).toBeNull();
  });
});

describe("预览区画面的选择", () => {
  it("页面就绪优先，其次崩溃、失败原因、较慢、等待，最后才是已停止", () => {
    const base = sampleTab({ previewUrl: null });
    expect(previewScreenOf({ ...base, previewUrl: "http://127.0.0.1:7101/" })).toBe("page");
    expect(previewScreenOf({ ...base, state: "crashed", active: false })).toBe("crashed");
    expect(
      previewScreenOf({
        ...base,
        active: false,
        failure: { code: "TOOL_MISSING", params: {} },
      }),
    ).toBe("missing");
    expect(
      previewScreenOf({
        ...base,
        active: false,
        failure: { code: "SETUP_FAILED", params: {} },
      }),
    ).toBe("start-failed");
    expect(previewScreenOf({ ...base, active: true, slow: true })).toBe("slow");
    expect(previewScreenOf({ ...base, active: true })).toBe("starting");
    expect(previewScreenOf({ ...base, active: true, state: "stopping" })).toBe("waiting");
    expect(previewScreenOf({ ...base, active: false, state: "stopped" })).toBe("stopped");
  });
});
