import type { Localized } from "@runyard/i18n";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoticeCard } from "./NoticeCard.tsx";

const text = (s: string) => s as Localized;
afterEach(() => vi.useRealTimers());
describe("通知卡片", () => {
  it("[DESKTOP-NOTIFICATIONS-02] 累计8秒未悬停后收起，悬停期间暂停", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(
      <NoticeCard
        title={text("标题")}
        dismissLabel={text("关闭")}
        onDismiss={dismiss}
        duration={8000}
      />,
    );
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.pointerEnter(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(9000));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerLeave(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(4999));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    act(() => vi.advanceTimersByTime(180));
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it("[DESKTOP-NOTIFICATIONS-11] 新通知可播报且不拿走输入焦点", () => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    render(<NoticeCard title={text("标题")} dismissLabel={text("关闭")} onDismiss={() => {}} />);
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole("status").textContent).toContain("标题");
    input.remove();
  });
  it("需要处理的卡片一直保留，键盘可关闭", async () => {
    const dismiss = vi.fn();
    render(<NoticeCard title={text("标题")} dismissLabel={text("关闭")} onDismiss={dismiss} />);
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "关闭" }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(dismiss).toHaveBeenCalledOnce());
  });
});
