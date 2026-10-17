import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl } from "./SegmentedControl.tsx";

const items = [
  { value: "7", label: "7 d" as Localized },
  { value: "30", label: "30 d" as Localized },
];

describe("SegmentedControl", () => {
  it("选中的那段 aria-pressed；点另一段回调拿到它的值", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label={"span" as Localized}
        items={items}
        value="30"
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("button", { name: "30 d" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(screen.getByRole("button", { name: "7 d" }));
    expect(onValueChange).toHaveBeenCalledWith("7");
  });

  it("再点已选中的那段不会取消选择", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SegmentedControl
        label={"span" as Localized}
        items={items}
        value="30"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "30 d" }));
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
