import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SlidingIndicator } from "./SlidingIndicator.tsx";
import { useSlidingIndicator } from "./use-sliding-indicator.ts";

// jsdom 没有版面：offsetLeft 等用各格的 data-x、data-w 代替，才能看出“量到了哪一格”
const original = Object.getOwnPropertyDescriptors(HTMLElement.prototype);
beforeEach(() => {
  for (const [name, key] of [
    ["offsetLeft", "x"],
    ["offsetWidth", "w"],
  ] as const) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return Number(this.dataset[key] ?? 0);
      },
    });
  }
});
afterEach(() => {
  for (const name of ["offsetLeft", "offsetWidth"]) {
    const saved = original[name];
    if (saved !== undefined) Object.defineProperty(HTMLElement.prototype, name, saved);
  }
});

function Strip({ selected, extra = false }: { selected: string; extra?: boolean }) {
  const slide = useSlidingIndicator<HTMLDivElement>(selected);
  return (
    <div ref={slide.container} data-testid="strip">
      <SlidingIndicator indicatorRef={slide.indicator} />
      {extra ? <span data-x="0" data-w="10" /> : null}
      <span
        data-x={extra ? "10" : "0"}
        data-w="40"
        data-selected={selected === "a" ? "" : undefined}
      />
      <span
        data-x={extra ? "50" : "40"}
        data-w="60"
        data-selected={selected === "b" ? "" : undefined}
      />
    </div>
  );
}

const bar = () => screen.getByTestId("strip").querySelector("span[aria-hidden]") as HTMLElement;

describe("滑动的选中背景", () => {
  it("第一次画出来直接贴到选中格，不带动画", () => {
    render(<Strip selected="a" />);
    expect(bar().style.getPropertyValue("--slide-x")).toBe("0px");
    expect(bar().style.getPropertyValue("--slide-w")).toBe("40px");
    expect(bar().hasAttribute("data-ready")).toBe(true);
    expect(bar().hasAttribute("data-animate")).toBe(false);
  });

  it("用户换了选中项才滑：带 data-animate，位置和宽度跟到新格", () => {
    const { rerender } = render(<Strip selected="a" />);
    rerender(<Strip selected="b" />);
    expect(bar().style.getPropertyValue("--slide-x")).toBe("40px");
    expect(bar().style.getPropertyValue("--slide-w")).toBe("60px");
    expect(bar().getAttribute("data-animate")).toMatch(/^[ab]$/);
  });

  it("连续换两次，data-animate 的值交替，减弱动态效果的淡入才能重新开始", () => {
    const { rerender } = render(<Strip selected="a" />);
    rerender(<Strip selected="b" />);
    const first = bar().getAttribute("data-animate");
    rerender(<Strip selected="a" />);
    expect(bar().getAttribute("data-animate")).not.toBe(first);
  });

  it("选中项没变、只是别的格子增删导致位置变了：直接贴，不带动画", () => {
    const { rerender } = render(<Strip selected="b" />);
    rerender(<Strip selected="b" extra />);
    expect(bar().style.getPropertyValue("--slide-x")).toBe("50px");
    expect(bar().hasAttribute("data-animate")).toBe(false);
  });
});
