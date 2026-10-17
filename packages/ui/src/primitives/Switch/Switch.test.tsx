import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch.tsx";

const label = "auto clean" as Localized;

describe("Switch", () => {
  it("名字是 label；空格键切换，回调拿到新状态", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label={label} onCheckedChange={onCheckedChange} />);
    const toggle = screen.getByRole("switch", { name: "auto clean" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await user.tab();
    expect(document.activeElement).toBe(toggle);
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("禁用时点不动", async () => {
    const user = userEvent.setup();
    const onCheckedChange = vi.fn();
    render(<Switch label={label} disabled onCheckedChange={onCheckedChange} />);
    await user.click(screen.getByRole("switch"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
