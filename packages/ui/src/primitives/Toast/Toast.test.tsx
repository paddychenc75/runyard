import type { Localized } from "@runyard/i18n";
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Toast } from "./Toast.tsx";

afterEach(() => vi.useRealTimers());
it("[DESKTOP-NOTIFICATIONS-08] 成功提示两秒后收起", () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  render(<Toast message={"已复制" as Localized} onDismiss={dismiss} />);
  expect(screen.getByRole("status").textContent).toBe("已复制");
  act(() => vi.advanceTimersByTime(1999));
  expect(dismiss).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  act(() => vi.advanceTimersByTime(180));
  expect(dismiss).toHaveBeenCalledOnce();
});
