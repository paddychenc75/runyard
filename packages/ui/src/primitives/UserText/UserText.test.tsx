import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { UserText } from "./UserText.tsx";

describe("UserText", () => {
  it("自动带 data-user-content，伪语言扫页面时整棵子树跳过", () => {
    render(<UserText>my-playground</UserText>);
    const node = screen.getByText("my-playground");
    expect(node.hasAttribute("data-user-content")).toBe(true);
  });

  it("mono 写成 data-mono；ref、className 和原生属性透传", () => {
    const ref = createRef<HTMLSpanElement>();
    render(
      <UserText mono ref={ref} className="extra" data-testid="u">
        :7101
      </UserText>,
    );
    const node = screen.getByTestId("u");
    expect(ref.current).toBe(node);
    expect(node.hasAttribute("data-mono")).toBe(true);
    expect(node.className).toContain("extra");
  });

  it("调用方无法用传入的属性去掉标记", () => {
    render(<UserText data-testid="u" {...{ "data-user-content": undefined }} />);
    expect(screen.getByTestId("u").hasAttribute("data-user-content")).toBe(true);
  });
});
