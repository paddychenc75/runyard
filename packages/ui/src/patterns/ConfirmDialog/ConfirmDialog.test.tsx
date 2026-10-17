import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog, type ConfirmDialogProps } from "./ConfirmDialog.tsx";

const text = (value: string) => value as Localized;

function setup(props: Partial<ConfirmDialogProps> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <ConfirmDialog
      open
      title={text("Close it?")}
      description={text("It will stop.")}
      icon="stop"
      cancelLabel={text("Cancel")}
      confirmLabel={text("Close and stop")}
      optOut={{ label: text("Do not ask again"), hint: text("Stops directly next time") }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, ...view };
}

describe("ConfirmDialog", () => {
  it("tone 为 danger 时确认钮和图标块用红色，缺省仍是强调色", async () => {
    const { unmount } = setup({ tone: "danger" });
    const confirm = await screen.findByRole("button", { name: "Close and stop" });
    expect(confirm.getAttribute("data-variant")).toBe("destructive");
    expect(document.querySelector('[data-tone="danger"]')).not.toBeNull();
    unmount();
    setup();
    const plain = await screen.findByRole("button", { name: "Close and stop" });
    expect(plain.getAttribute("data-variant")).toBe("primary");
  });

  it("是带标题和说明的警示对话框，焦点先落在取消上", async () => {
    setup();
    const dialog = await screen.findByRole("alertdialog", { name: "Close it?" });
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText("It will stop.")).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" })),
    );
  });

  it("点确认把勾选状态交出去：没勾是 false，勾了是 true", async () => {
    const user = userEvent.setup();
    const first = setup();
    await user.click(await screen.findByRole("button", { name: "Close and stop" }));
    expect(first.onConfirm).toHaveBeenCalledWith(false);
    first.unmount();

    const second = setup();
    await user.click(await screen.findByRole("checkbox", { name: "Do not ask again" }));
    await user.click(screen.getByRole("button", { name: "Close and stop" }));
    expect(second.onConfirm).toHaveBeenCalledWith(true);
  });

  it("点取消和按 Escape 都只走 onCancel，不会确认", async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = setup();
    await user.click(await screen.findByRole("checkbox", { name: "Do not ask again" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("重新打开时勾选项回到未勾选", async () => {
    const user = userEvent.setup();
    const { rerender, onConfirm, onCancel } = setup();
    await user.click(await screen.findByRole("checkbox", { name: "Do not ask again" }));
    const props = {
      title: text("Close it?"),
      description: text("It will stop."),
      icon: "stop" as const,
      cancelLabel: text("Cancel"),
      confirmLabel: text("Close and stop"),
      optOut: { label: text("Do not ask again") },
      onConfirm,
      onCancel,
    };
    rerender(<ConfirmDialog {...props} open={false} />);
    rerender(<ConfirmDialog {...props} open />);
    const box = await screen.findByRole("checkbox", { name: "Do not ask again" });
    expect(box.getAttribute("aria-checked")).toBe("false");
  });

  it("没有勾选项时不显示勾选框，确认参数恒为 false", async () => {
    const user = userEvent.setup();
    const { onConfirm } = setup({ optOut: undefined });
    expect(screen.queryByRole("checkbox")).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Close and stop" }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });
});
