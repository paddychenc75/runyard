import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconButton } from "../IconButton/index.ts";
import { Tooltip } from "./Tooltip.tsx";

const name = "close it" as Localized;
const tip = "close this tab" as Localized;

function setup(props: { open?: boolean; onOpenChange?: (open: boolean) => void } = {}) {
  return render(
    <Tooltip content={tip} delay={0} {...props}>
      <IconButton icon="close" label={name} />
    </Tooltip>,
  );
}

describe("Tooltip", () => {
  it("悬停后出现提示，移开后消失，触发元素仍是原来的按钮", async () => {
    const user = userEvent.setup();
    setup();
    const button = screen.getByRole("button", { name: "close it" });
    expect(screen.queryByText("close this tab")).toBeNull();
    await user.hover(button);
    expect(await screen.findByText("close this tab")).toBeTruthy();
    await user.unhover(button);
    await vi.waitFor(() => expect(screen.queryByText("close this tab")).toBeNull());
  });

  it("键盘聚焦也会出现提示，Escape 关掉", async () => {
    const user = userEvent.setup();
    setup();
    await user.tab();
    expect(await screen.findByText("close this tab")).toBeTruthy();
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByText("close this tab")).toBeNull());
  });

  it("受控打开时直接显示，不需要悬停", () => {
    setup({ open: true });
    expect(screen.getByText("close this tab")).toBeTruthy();
  });

  it("打开和关闭都通知 onOpenChange，参数是新的开合状态", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    setup({ onOpenChange });
    await user.hover(screen.getByRole("button", { name: "close it" }));
    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything()));
  });
});
