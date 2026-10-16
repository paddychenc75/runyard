import { describe, expect, it, vi } from "vitest";
import { OverlayCounter } from "./overlay-counter.ts";

const area = { x: 100, y: 100, width: 200, height: 200 };

describe("浮层计数器", () => {
  it("计数加减并通知；重复关闭无害", () => {
    const counter = new OverlayCounter();
    const listener = vi.fn();
    counter.subscribe(listener);
    const close = counter.acquire();
    expect(counter.covers(area)).toBe(true);
    close();
    close();
    expect(counter.covers(area)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("只有矩形与占位区重叠的浮层才算盖住；不带矩形的按盖住处理", () => {
    const counter = new OverlayCounter();
    counter.acquire({ x: 0, y: 0, width: 50, height: 50 });
    expect(counter.covers(area)).toBe(false);
    counter.acquire({ x: 250, y: 250, width: 100, height: 100 });
    expect(counter.covers(area)).toBe(true);
    const other = new OverlayCounter();
    other.acquire();
    expect(other.covers(area)).toBe(true);
  });
});
