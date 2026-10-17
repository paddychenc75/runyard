import type { Localized } from "@runyard/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Field } from "../Field/index.ts";
import { TextField } from "../TextField/index.ts";
import { Dialog } from "./Dialog.tsx";

function setup(props: { onSubmit?: () => void; onOpenChange?: (open: boolean) => void } = {}) {
  const onSubmit = props.onSubmit ?? vi.fn();
  const onOpenChange = props.onOpenChange ?? vi.fn();
  render(
    <Dialog
      open
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      title={"New" as Localized}
      subtitle={"Template" as Localized}
      actions={<button type="submit">Go</button>}
    >
      <Field label={"Name" as Localized}>
        <TextField defaultValue="a" />
      </Field>
    </Dialog>,
  );
  return { onSubmit, onOpenChange };
}

describe("Dialog", () => {
  it("名字是标题；焦点进入弹窗；输入框里按回车提交", async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    expect(screen.getByRole("dialog", { name: "New" })).toBeTruthy();
    const input = screen.getByRole("textbox", { name: "Name" });
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("输入法组词时的回车被拦下（默认动作取消，不会触发提交）；平常的回车不拦", () => {
    const { onSubmit } = setup();
    const input = screen.getByRole("textbox", { name: "Name" });
    // fireEvent 在默认动作被取消时返回 false；jsdom 不做隐式提交，所以看“有没有被拦”
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true })).toBe(false);
    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 13 })).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("Escape 请求关闭，不提交", async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = setup();
    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
