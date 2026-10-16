import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusMark } from "./StatusMark.tsx";

const text = (value: string) => value as Localized;

describe("StatusMark", () => {
  it("显示文字，圆点是装饰", () => {
    const { container } = render(<StatusMark status="running">{text("running")}</StatusMark>);
    expect(screen.getByText("running")).toBeTruthy();
    expect(container.querySelector("[aria-hidden=true]")).not.toBeNull();
  });

  it("只有圆点时，用 markLabel 当名字", () => {
    render(<StatusMark status="crashed" markLabel={text("crashed")} />);
    expect(screen.getByRole("img", { name: "crashed" })).toBeTruthy();
  });

  it("状态写在 data-status 上，样式靠它换颜色和形状", () => {
    const { container } = render(<StatusMark status="stopped">{text("x")}</StatusMark>);
    expect(container.firstElementChild?.getAttribute("data-status")).toBe("stopped");
  });
});
