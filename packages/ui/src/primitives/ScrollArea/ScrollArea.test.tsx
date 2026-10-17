import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("滚动条的出现与消失（视觉规范第 5 节）", () => {
    afterEach(() => vi.useRealTimers());

    it("指针在区域里移动就出现，停下 800ms 后才消失；再动一下重新计时", () => {
      vi.useFakeTimers();
      render(<ScrollArea data-testid="area">x</ScrollArea>);
      const area = screen.getByTestId("area");
      expect(area.hasAttribute("data-active")).toBe(false);
      fireEvent.pointerMove(area);
      expect(area.hasAttribute("data-active")).toBe(true);
      act(() => vi.advanceTimersByTime(799));
      expect(area.hasAttribute("data-active")).toBe(true);
      fireEvent.pointerMove(area);
      act(() => vi.advanceTimersByTime(799));
      expect(area.hasAttribute("data-active")).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(area.hasAttribute("data-active")).toBe(false);
    });

    it("滚动视口也让它出现，并且调用方自己的 onScroll 照常收到", () => {
      vi.useFakeTimers();
      const seen = vi.fn();
      render(
        <ScrollArea data-testid="area" viewportProps={{ role: "log", onScroll: seen }}>
          x
        </ScrollArea>,
      );
      fireEvent.scroll(screen.getByRole("log"));
      expect(seen).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("area").hasAttribute("data-active")).toBe(true);
    });

    it("viewportRef 指向真正滚动的那个元素", () => {
      const ref = createRef<HTMLDivElement>();
      render(
        <ScrollArea viewportRef={ref} viewportProps={{ role: "log" }}>
          x
        </ScrollArea>,
      );
      expect(ref.current).toBe(screen.getByRole("log"));
    });
  });
});
