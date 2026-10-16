import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox.tsx";

const label = "ask no more" as Localized;
const hint = "stops straight away" as Localized;

describe("Checkbox", () => {
  it("名字是 label，说明关联为描述；空格键勾选，回调拿到新状态", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label={label} hint={hint} onCheckedChange={onCheckedChange} />);
    const box = screen.getByRole("checkbox", { name: "ask no more" });
    expect(box.getAttribute("aria-checked")).toBe("false");
    await user.tab();
    expect(document.activeElement).toBe(box);
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("stops straight away")).toBeTruthy();
  });

  it("点文字也能勾选；再点取消", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label={label} onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByText("ask no more"));
    await user.click(screen.getByText("ask no more"));
    expect(onCheckedChange.mock.calls.map((call) => call[0])).toEqual([true, false]);
  });

  it("禁用时点不动", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Checkbox label={label} disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByText("ask no more"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
