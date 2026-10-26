// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWindowFocused } from "./use-window-focused.ts";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("宿主焦点改变更新状态，卸载移除监听", () => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const remove = vi.spyOn(window, "removeEventListener");
  const { result, unmount } = renderHook(() => useWindowFocused());
  expect(result.current).toBe(true);
  act(() => {
    window.dispatchEvent(new Event("blur"));
  });
  expect(result.current).toBe(false);
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(result.current).toBe(true);
  unmount();
  expect(remove.mock.calls.some(([name]) => name === "blur")).toBe(true);
  expect(remove.mock.calls.some(([name]) => name === "focus")).toBe(true);
});
