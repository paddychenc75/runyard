import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../Button/index.ts";
import { ButtonGroup } from "./ButtonGroup.tsx";

describe("ButtonGroup", () => {
  it("组里的主按钮和次按钮同一档，主次只差变体（#419）", () => {
    render(
      <ButtonGroup size="lg">
        <Button variant="primary">go</Button>
        <Button>more</Button>
      </ButtonGroup>,
    );
    const primary = screen.getByRole("button", { name: "go" });
    const neutral = screen.getByRole("button", { name: "more" });
    expect(primary.getAttribute("data-size")).toBe("lg");
    expect(neutral.getAttribute("data-size")).toBe("lg");
    expect(primary.getAttribute("data-variant")).toBe("primary");
    expect(neutral.getAttribute("data-variant")).toBe("neutral");
  });

  it("组里的 Button 自己传 size 也以组为准", () => {
    render(
      <ButtonGroup size="sm">
        <Button size="lg">a</Button>
        <Button>b</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole("button", { name: "a" }).getAttribute("data-size")).toBe("sm");
    expect(screen.getByRole("button", { name: "b" }).getAttribute("data-size")).toBe("sm");
  });

  it("不传 size 的组是 md", () => {
    render(
      <ButtonGroup>
        <Button>a</Button>
      </ButtonGroup>,
    );
    expect(screen.getByRole("button", { name: "a" }).getAttribute("data-size")).toBe("md");
  });
});
