import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { TitleBar } from "./TitleBar.tsx";

describe("TitleBar", () => {
  it("是 banner 区域，内容原样显示，ref 和原生属性透传", () => {
    const ref = createRef<HTMLElement>();
    render(
      <TitleBar ref={ref} data-testid="bar" className="extra">
        <span>inside</span>
      </TitleBar>,
    );
    const bar = screen.getByTestId("bar");
    expect(ref.current).toBe(bar);
    expect(bar.className).toContain("extra");
    expect(screen.getByText("inside")).toBeTruthy();
  });

  it("窗口按钮的位置写成 data-controls，默认让出开头；none 不留空", () => {
    const { container, rerender } = render(<TitleBar />);
    expect(container.querySelector("header")?.dataset.controls).toBe("start");
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
    rerender(<TitleBar controls="none" />);
    expect(container.querySelector("header")?.dataset.controls).toBe("none");
    expect(container.querySelector("[aria-hidden='true']")).toBeNull();
  });

  it("留空的占位对读屏器隐藏", () => {
    const { container } = render(<TitleBar controls="end" />);
    expect(container.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("controls 写错是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #168 controls 只能是 start、end、none
      <TitleBar controls="left" />
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});
