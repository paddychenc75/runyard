import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "./ScrollArea.tsx";

describe("ScrollArea", () => {
  it("内容原样显示在视口里，className 和原生属性透传到最外层", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ScrollArea ref={ref} className="extra" data-testid="area">
        <p>inside</p>
      </ScrollArea>,
    );
    const area = screen.getByTestId("area");
    expect(ref.current).toBe(area);
    expect(area.className).toContain("extra");
    expect(screen.getByText("inside")).toBeTruthy();
    expect(area.contains(screen.getByText("inside"))).toBe(true);
  });

  it("方向写成 data-orientation，默认竖向", () => {
    render(
      <>
        <ScrollArea data-testid="a">x</ScrollArea>
        <ScrollArea data-testid="b" orientation="both">
          y
        </ScrollArea>
      </>,
    );
    expect(screen.getByTestId("a").dataset.orientation).toBe("vertical");
    expect(screen.getByTestId("b").dataset.orientation).toBe("both");
  });

  it("方向写错是类型错误", () => {
    const typeOnly = () => (
      // @ts-expect-error #168 orientation 只能是 vertical、horizontal、both
      <ScrollArea orientation="diagonal">x</ScrollArea>
    );
    expect(typeOnly).toBeTypeOf("function");
  });
});
