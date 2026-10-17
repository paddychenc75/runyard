import type { Localized } from "@runyard/i18n";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AlertDialog } from "./AlertDialog.tsx";

const text = (value: string) => value as Localized;

describe("AlertDialog", () => {
  it("关着时不渲染，打开后有名字和描述，按钮可用", async () => {
    const onOpenChange = vi.fn();
    const props = {
      onOpenChange,
      title: text("Sure?"),
      description: text("Details here."),
      actions: <button type="button">go</button>,
    };
    const { rerender } = render(<AlertDialog {...props} open={false} />);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    rerender(<AlertDialog {...props} open />);
    const dialog = await screen.findByRole("alertdialog", { name: "Sure?" });
    expect(dialog.textContent).toContain("Details here.");
    expect(screen.getByRole("button", { name: "go" })).toBeTruthy();
  });

  it("按 Escape 请求关闭（open 变 false），焦点被困在弹窗内", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <>
        <button type="button">outside</button>
        <AlertDialog
          open
          onOpenChange={onOpenChange}
          title={text("Sure?")}
          description={text("Details here.")}
          actions={<button type="button">go</button>}
        />
      </>,
    );
    const dialog = await screen.findByRole("alertdialog");
    const focusIsInDialog = () => expect(dialog.contains(document.activeElement)).toBe(true);
    // 焦点进出弹窗都不是同步的：Base UI 在下一个动画帧才把初始焦点移进弹窗，
    // Tab 走到弹窗边缘的焦点守卫后，也是下一帧才把焦点拉回弹窗。
    // 测试按键比这些帧快（慢机器上尤其），Tab 会越过守卫落到弹窗外的按钮上（#235）。
    // 所以每一步都等焦点确实回到弹窗里再继续；断言本身不变：焦点始终没有跑到弹窗外
    await waitFor(focusIsInDialog);
    for (let i = 0; i < 3; i++) {
      await user.tab();
      await waitFor(focusIsInDialog);
    }
    expect(document.activeElement).not.toBe(screen.getByText("outside"));
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
