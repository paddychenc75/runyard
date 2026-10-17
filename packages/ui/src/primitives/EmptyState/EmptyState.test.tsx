import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.tsx";

const text = (value: string) => value as Localized;

describe("EmptyState", () => {
  it("有标题、说明和调用方放进来的操作；线稿是装饰", () => {
    const { container } = render(
      <EmptyState title={text("none")} description={text("hint")}>
        <button type="button">go</button>
      </EmptyState>,
    );
    expect(screen.getByRole("heading", { name: "none" })).toBeTruthy();
    expect(screen.getByText("hint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "go" })).toBeTruthy();
    expect(container.querySelector("svg[aria-hidden=true]")).not.toBeNull();
  });

  it("没有说明时不画说明段落", () => {
    const { container } = render(<EmptyState title={text("none")} />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("线稿可以换成搜索没有结果的那一张", () => {
    const { container } = render(<EmptyState art="search" title={text("none")} />);
    expect(container.querySelector("svg circle")).not.toBeNull();
    expect(container.querySelector("svg rect")).toBeNull();
  });
});
