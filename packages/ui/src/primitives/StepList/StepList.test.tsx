import type { Localized } from "@runyard/i18n";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepList } from "./StepList.tsx";

const text = (value: string) => value as Localized;

describe("StepList", () => {
  it("每步一个名字，状态写在 data-status 上，当前步骤带 aria-current", () => {
    render(
      <StepList
        label={text("steps")}
        steps={[
          { id: "a", label: text("copy"), status: "done" },
          { id: "b", label: text("install"), status: "failed" },
          { id: "c", label: text("start"), status: "current" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "steps" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-status"))).toEqual([
      "done",
      "failed",
      "current",
    ]);
    expect(items[2]?.getAttribute("aria-current")).toBe("step");
    expect(items[1]?.getAttribute("aria-current")).toBeNull();
  });

  it("失败是带叉的标记，完成是对勾，未到的没有图标（形状不只靠颜色）", () => {
    const { container } = render(
      <StepList
        label={text("steps")}
        steps={[
          { id: "a", label: text("a"), status: "done" },
          { id: "b", label: text("b"), status: "failed" },
          { id: "c", label: text("c"), status: "pending" },
        ]}
      />,
    );
    const icons = [...container.querySelectorAll("li")].map(
      (li) =>
        li.querySelector("svg")?.getAttribute("data-icon") ??
        li.querySelector('[data-status="crashed"][data-size="step"]')?.getAttribute("data-status"),
    );
    expect(icons).toEqual(["check", "crashed", undefined]);
  });
});
