// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { CommandContext, CommandHost } from "../shared/command-host.tsx";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import { addressLabel, PreviewPane } from "./PreviewPane.tsx";
import { sampleTab } from "./sample-tab.ts";

afterEach(cleanup);

// jsdom 没有 ResizeObserver，也不做版面；给占位区一个固定的矩形
const RECT = { x: 256, y: 68, width: 700, height: 500 };
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  // 一帧约 5 毫秒：给 React 留出把截图画进界面的时间
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 5));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    ...RECT,
    top: RECT.y,
    left: RECT.x,
    right: RECT.x + RECT.width,
    bottom: RECT.y + RECT.height,
    toJSON: () => RECT,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tab = (previewUrl: string | null): TabRow =>
  sampleTab({
    status: previewUrl === null ? "starting" : "running",
    state: previewUrl === null ? "starting" : "ready",
    previewUrl,
  });

function setup(row: TabRow, capture: string | null | Error = "data:image/png;base64,AAAA") {
  const calls: [string, unknown][] = [];
  // 隐藏视图的那一刻，截图是否已经在界面里了
  const frameShownWhenHidden: boolean[] = [];
  const bridge = {
    bootstrap: { platform: "darwin" },
    call: vi.fn(async (method: string, param?: unknown) => {
      calls.push([method, param]);
      if (method === "preview.visible" && param === false) {
        frameShownWhenHidden.push(document.querySelector("[data-preview-frame]") !== null);
      }
      if (method === "console.get") return [];
      if (method === "preview.capture" && capture instanceof Error) throw capture;
      return method === "preview.capture" ? capture : undefined;
    }),
    on: () => () => {},
  } as unknown as DesktopBridge;
  const overlays = new OverlayCounter();
  const commands = new CommandHost();
  const view = (next: TabRow) => (
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <CommandContext.Provider value={commands}>
        <PreviewPane bridge={bridge} tab={next} overlays={overlays} />
      </CommandContext.Provider>
    </I18nProvider>
  );
  const utils = render(view(row));
  return {
    ...utils,
    calls,
    bridge,
    commands,
    frameShownWhenHidden,
    overlays,
    rerender: (next: TabRow) => utils.rerender(view(next)),
  };
}

// jsdom 没有 AnimationEvent，React 在初始化时选择 webkitAnimationIteration；真实 Electron 用标准事件。
function completedCircle(button: HTMLElement): void {
  fireEvent(button, new Event("webkitAnimationIteration", { bubbles: true }));
}

describe("预览区", () => {
  it("[DESKTOP-WORKSPACE-71] 刷新立即忙碌，真实请求结束前不重复发送，快速完成仍保留一圈", async () => {
    const { bridge, calls } = setup(tab("http://127.0.0.1:7101/"));
    let finish = () => {};
    vi.mocked(bridge.call).mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const button = screen.getByRole("button", { name: "刷新" });
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    try {
      fireEvent.click(button);
      expect(button.getAttribute("aria-busy")).toBe("true");
      fireEvent.click(button);
      expect(
        vi.mocked(bridge.call).mock.calls.filter(([name]) => name === "preview.reload"),
      ).toHaveLength(1);
      await act(async () => finish());
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect((button as HTMLButtonElement).disabled).toBe(false);
      await act(async () => vi.advanceTimersByTime(900));
      expect(button.getAttribute("aria-busy")).toBe("true");
      completedCircle(button);
      expect(button.getAttribute("aria-busy")).toBe("false");
      expect(calls.filter(([name]) => name === "run.restart")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[DESKTOP-WORKSPACE-71] 命令入口同样旋转，慢加载不提前结束，失败后可重试", async () => {
    const { bridge, commands } = setup(tab("http://127.0.0.1:7101/"));
    let fail = () => {};
    vi.mocked(bridge.call).mockImplementationOnce(
      () =>
        new Promise<undefined>((_resolve, reject) => {
          fail = () => reject(new Error("disconnected"));
        }),
    );
    const button = screen.getByRole("button", { name: "刷新" });
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    try {
      act(() => {
        expect(commands.run("project.reloadPreview")).toBe(true);
      });
      await act(async () => vi.advanceTimersByTime(2000));
      expect(button.getAttribute("aria-busy")).toBe("true");
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(commands.run("project.reloadPreview")).toBe(false);
      await act(async () => fail());
      await act(async () => vi.advanceTimersByTime(900));
      completedCircle(button);
      expect(button.getAttribute("aria-busy")).toBe("false");
      expect((button as HTMLButtonElement).disabled).toBe(false);
      act(() => {
        commands.run("project.reloadPreview");
      });
      expect(button.getAttribute("aria-busy")).toBe("true");
      await act(async () => vi.runOnlyPendingTimers());
    } finally {
      vi.useRealTimers();
    }
  });

  it("[DESKTOP-WORKSPACE-71] 切换项目或替换地址后旧回调不能结束新的旋转，卸载不遗留计时器", async () => {
    const { bridge, rerender, unmount } = setup(tab("http://127.0.0.1:7101/"));
    const finishes: (() => void)[] = [];
    vi.mocked(bridge.call).mockImplementation((method) => {
      if (method === "preview.reload")
        return new Promise<undefined>((resolve) => {
          finishes.push(() => resolve(undefined));
        });
      return Promise.resolve(undefined);
    });
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    try {
      const button = () => screen.getByRole("button", { name: "刷新" });
      fireEvent.click(button());
      rerender({ ...tab("http://127.0.0.1:7102/"), id: "b" });
      expect(button().getAttribute("aria-busy")).toBe("false");
      fireEvent.click(button());
      await act(async () => finishes[0]?.());
      await act(async () => vi.runOnlyPendingTimers());
      expect(button().getAttribute("aria-busy")).toBe("true");
      rerender({ ...tab("http://127.0.0.1:7103/"), id: "b" });
      fireEvent.click(button());
      await act(async () => finishes[1]?.());
      expect(button().getAttribute("aria-busy")).toBe("true");
      await act(async () => finishes[2]?.());
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[DESKTOP-WORKSPACE-71] 快速刷新收尾可再点，本圈剩余不足一圈时继续旋转", async () => {
    const { bridge } = setup(tab("http://127.0.0.1:7101/"));
    const button = screen.getByRole("button", { name: "刷新" });
    vi.useFakeTimers();
    vi.spyOn(performance, "now").mockImplementation(() => Date.now());
    try {
      await act(async () => fireEvent.click(button));
      await act(async () => vi.advanceTimersByTime(800));
      expect((button as HTMLButtonElement).disabled).toBe(false);
      await act(async () => fireEvent.click(button));
      expect(
        vi.mocked(bridge.call).mock.calls.filter(([name]) => name === "preview.reload"),
      ).toHaveLength(2);
      await act(async () => vi.advanceTimersByTime(100));
      completedCircle(button);
      expect(button.getAttribute("aria-busy")).toBe("true");
      await act(async () => vi.advanceTimersByTime(800));
      completedCircle(button);
      expect(button.getAttribute("aria-busy")).toBe("false");
    } finally {
      vi.useRealTimers();
    }
  });

  it("[DESKTOP-WORKSPACE-71] 减少动态效果不等动画事件，偏好中途改变也不会卡住", async () => {
    let changed = () => {};
    const media = {
      matches: true,
      addEventListener: vi.fn((_event, listener) => {
        changed = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("matchMedia", () => media);
    const { unmount } = setup(tab("http://127.0.0.1:7101/"));
    const button = screen.getByRole("button", { name: "刷新" });
    await act(async () => fireEvent.click(button));
    expect(button.getAttribute("aria-busy")).toBe("false");
    media.matches = false;
    act(changed);
    await act(async () => fireEvent.click(button));
    expect(button.getAttribute("aria-busy")).toBe("true");
    media.matches = true;
    act(changed);
    expect(button.getAttribute("aria-busy")).toBe("false");
    unmount();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", changed);
  });

  it("[DESKTOP-WORKSPACE-13] 没就绪时占位区显示说明；就绪后地址栏显示地址，占位区把位置报给主进程", () => {
    const { calls, rerender } = setup(tab(null));
    expect(screen.getByRole("heading", { name: "正在启动 react-counter" })).toBeTruthy();
    expect(calls).toContainEqual(["preview.bounds", RECT]);
    rerender(tab("http://127.0.0.1:7101/"));
    expect(screen.queryByRole("heading", { name: "正在启动 react-counter" })).toBeNull();
    expect(screen.getByText("127.0.0.1:7101/")).toBeTruthy();
    expect(addressLabel("http://127.0.0.1:7101/")).toBe("127.0.0.1:7101/");
  });

  it("[DESKTOP-WORKSPACE-31] 点地址栏的“刷新”：请求重新加载这个项目的预览，地址不变", async () => {
    const { calls } = setup(tab("http://127.0.0.1:7101/"));
    await userEvent.setup().click(screen.getByRole("button", { name: "刷新" }));
    expect(calls).toContainEqual(["preview.reload", "a"]);
    expect(screen.getByText("127.0.0.1:7101/")).toBeTruthy();
  });

  it("[DESKTOP-WORKSPACE-32] 点“在浏览器中打开”：请求用系统浏览器打开这个项目预览的地址", async () => {
    const { calls } = setup(tab("http://127.0.0.1:7101/"));
    await userEvent.setup().click(screen.getByRole("button", { name: "在浏览器中打开" }));
    expect(calls).toContainEqual(["preview.openExternal", "a"]);
  });

  it("[DESKTOP-WORKSPACE-33] 点“开发者工具”：请求打开预览页面的开发者工具", async () => {
    const { calls } = setup(tab("http://127.0.0.1:7101/"));
    await userEvent.setup().click(screen.getByRole("button", { name: "开发者工具" }));
    expect(calls).toContainEqual(["preview.devtools", "a"]);
  });

  it("页面没就绪时地址栏的三个按钮不可点", () => {
    setup(sampleTab({ state: "stopped", active: false, status: "stopped", previewUrl: null }));
    for (const name of ["刷新", "在浏览器中打开", "开发者工具"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("占位区卸载时告诉主进程它不在了", () => {
    const { calls, unmount } = setup(tab("http://127.0.0.1:7101/"));
    unmount();
    expect(calls.at(-1)).toEqual(["preview.bounds", null]);
  });

  it("弹窗打开时先截一帧显示、再隐藏预览视图，关闭后换回视图再去掉截图", async () => {
    const { calls, frameShownWhenHidden, overlays, container } = setup(
      tab("http://127.0.0.1:7101/"),
    );
    let close = (): void => {};
    act(() => {
      close = overlays.acquire({ x: 300, y: 100, width: 200, height: 200 });
    });
    await waitFor(() => expect(container.querySelector("[data-preview-frame]")).not.toBeNull());
    await waitFor(() => expect(calls).toContainEqual(["preview.visible", false]));
    const names = calls.map(([method]) => method);
    // 次序：先截帧，截图画出来之后才隐藏视图（反过来会闪一下底色）
    expect(names.indexOf("preview.capture")).toBeLessThan(names.indexOf("preview.visible"));
    expect(frameShownWhenHidden).toEqual([true]);

    act(() => close());
    await waitFor(() => expect(container.querySelector("[data-preview-frame]")).toBeNull());
    expect(calls).toContainEqual(["preview.visible", true]);
  });

  it("不与占位区重叠的浮层不动预览", async () => {
    const { calls, overlays } = setup(tab("http://127.0.0.1:7101/"));
    act(() => {
      overlays.acquire({ x: 0, y: 0, width: 200, height: 40 });
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls.map(([method]) => method)).not.toContain("preview.capture");
  });

  it("没有预览可截（页面没就绪）时浮层打开也要隐藏视图，晚就绪的视图不会盖在浮层上 [#302]", async () => {
    const { calls, overlays } = setup(tab(null), null);
    act(() => {
      overlays.acquire();
    });
    await waitFor(() => expect(calls).toContainEqual(["preview.visible", false]));
  });

  it("截图失败（抛错）时浮层打开也要隐藏视图 [#302]", async () => {
    const { calls, overlays } = setup(tab("http://127.0.0.1:7101/"), new Error("capture failed"));
    act(() => {
      overlays.acquire();
    });
    await waitFor(() => expect(calls).toContainEqual(["preview.visible", false]));
  });
});
