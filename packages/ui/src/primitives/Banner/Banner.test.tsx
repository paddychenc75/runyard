import type { Localized } from "@runyard/i18n";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "./Banner.tsx";

const text = (value: string) => value as Localized;

describe("Banner", () => {
  it("标题、说明、详情和操作都在，图标块是装饰", () => {
    const { container } = render(
      <Banner title={text("t")} description={text("d")} actions={<button type="button">ok</button>}>
        <span>detail</span>
      </Banner>,
    );
    expect(screen.getByRole("heading", { name: "t" })).toBeTruthy();
    expect(screen.getByText("d")).toBeTruthy();
    expect(screen.getByText("detail")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ok" })).toBeTruthy();
    expect(container.querySelector("[aria-hidden=true] svg")).not.toBeNull();
  });

  it("是一个 status 区域，音调写在 data-tone 上", () => {
    render(<Banner tone="danger" title={text("t")} />);
    expect(screen.getByRole("status").getAttribute("data-tone")).toBe("danger");
  });

  it("没有说明、详情、操作时不画它们", () => {
    const { container } = render(<Banner title={text("t")} />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});
