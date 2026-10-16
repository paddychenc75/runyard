import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
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
    await screen.findByRole("alertdialog");
    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).not.toBe(screen.getByText("outside"));
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
