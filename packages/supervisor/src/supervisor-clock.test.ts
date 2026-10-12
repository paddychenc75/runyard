import { describe, expect, it } from "vitest";
import { createSystemClock } from "./supervisor-clock.ts";

describe("真实时钟", () => {
  it("定时器到点触发一次；取消之后不再触发", async () => {
    const clock = createSystemClock();
    const fired: string[] = [];
    clock.setTimeout(() => fired.push("a"), 5);
    const cancelled = clock.setTimeout(() => fired.push("b"), 5);
    clock.clearTimeout(cancelled);
    clock.clearTimeout(9999);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toEqual(["a"]);
    expect(clock.now()).toBeGreaterThan(0);
  });
});
