// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { onEditorFocusRequest } from "../shared/editor-focus.ts";
import type { ShellPage } from "./sidebar-navigation.ts";
import { useSettingsPage } from "./use-settings-page.ts";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("[DESKTOP-SETTINGS-46] 桥回调关闭设置时，编辑器可见提交前的绘制不能消费返回焦点请求", () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const paint = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  const observed: { visible: boolean; hidden: boolean }[] = [];
  let open = () => {};
  let closeFromBridge = () => {};
  let selectFromBridge = (_id: string) => {};
  const bridge = {
    bootstrap: { modKey: "meta" },
    call: vi.fn(async () => undefined),
  } as unknown as DesktopBridge;
  function Harness() {
    const [page, setPage] = useState<ShellPage>("library");
    const [active, setActive] = useState("demo");
    selectFromBridge = setActive;
    const settings = useSettingsPage(bridge, page, setPage, active, ["demo", "other"]);
    open = settings.open;
    closeFromBridge = settings.close;
    const visible = page !== "settings";
    // 与真实编辑器相同：被隐藏期间不执行收到的焦点请求。
    useEffect(
      () =>
        onEditorFocusRequest(() => {
          const editor = screen.getByTestId("editor");
          observed.push({ visible, hidden: editor.hasAttribute("hidden") });
        }),
      [visible],
    );
    return <main data-testid="editor" hidden={!visible} />;
  }
  render(<Harness />);
  act(open);
  expect(screen.getByTestId("editor").hasAttribute("hidden")).toBe(true);
  act(() => {
    // 模拟非 React 点击的桥回调；下一帧到来时可见性提交仍待处理。
    closeFromBridge();
    paint();
  });
  expect(observed).toEqual([]);
  expect(screen.getByTestId("editor").hasAttribute("hidden")).toBe(false);
  act(paint);
  expect(observed).toEqual([{ visible: true, hidden: false }]);
  act(open);
  act(closeFromBridge);
  // 已安排的返回请求遇到设置重新打开必须作废，不能让延迟帧抢焦点。
  act(open);
  act(paint);
  expect(observed).toEqual([{ visible: true, hidden: false }]);
  act(() => selectFromBridge("other"));
  act(closeFromBridge);
  act(paint);
  // 返回原项目需等待主进程确认选择；不能把焦点交给还未匹配的其他项目。
  expect(bridge.call).toHaveBeenCalledWith("tab.select", "demo");
  expect(observed).toHaveLength(1);
  act(() => selectFromBridge("demo"));
  act(paint);
  expect(observed).toEqual([
    { visible: true, hidden: false },
    { visible: true, hidden: false },
  ]);
  act(open);
  act(closeFromBridge);
  act(() => selectFromBridge("other"));
  act(paint);
  expect(observed).toHaveLength(2);
});
