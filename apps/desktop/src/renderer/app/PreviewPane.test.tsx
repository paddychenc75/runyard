// @vitest-environment jsdom
import { desktopCatalogs } from "@runyard/i18n";
import { I18nProvider } from "@runyard/i18n/react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
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

function setup(row: TabRow, capture: string | null = "data:image/png;base64,AAAA") {
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
      return method === "preview.capture" ? capture : undefined;
    }),
    on: () => () => {},
  } as unknown as DesktopBridge;
  const overlays = new OverlayCounter();
  const view = (next: TabRow) => (
    <I18nProvider locale="zh-CN" platform="darwin" catalogs={desktopCatalogs}>
      <PreviewPane bridge={bridge} tab={next} overlays={overlays} />
    </I18nProvider>
  );
  const utils = render(view(row));
  return {
    ...utils,
    calls,
    frameShownWhenHidden,
    overlays,
    rerender: (next: TabRow) => utils.rerender(view(next)),
  };
}

describe("预览区", () => {
  it("[DESKTOP-WORKSPACE-13] 没就绪时占位区显示说明；就绪后地址栏显示地址，占位区把位置报给主进程", () => {
    const { calls, rerender } = setup(tab(null));
    expect(screen.getByText("页面还没有就绪，就绪后会显示在这里。")).toBeTruthy();
    expect(calls).toContainEqual(["preview.bounds", RECT]);
    rerender(tab("http://127.0.0.1:7101/"));
    expect(screen.queryByText("页面还没有就绪，就绪后会显示在这里。")).toBeNull();
    expect(screen.getByText("127.0.0.1:7101/")).toBeTruthy();
    expect(addressLabel("http://127.0.0.1:7101/")).toBe("127.0.0.1:7101/");
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

  it("没有预览可截（页面没就绪）时浮层打开也不隐藏视图", async () => {
    const { calls, overlays } = setup(tab(null), null);
    act(() => {
      overlays.acquire();
    });
    await waitFor(() => expect(calls.map(([method]) => method)).toContain("preview.capture"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).not.toContainEqual(["preview.visible", false]);
  });
});
