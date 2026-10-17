import { describe, expect, it } from "vitest";
import { Coalesced } from "./coalesced.ts";

describe("并发合并的任务", () => {
  it("正在做时再来的请求合并成做完后补做的一次，所有请求者等到同一个结果", async () => {
    let runs = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const task = new Coalesced(async () => {
      runs += 1;
      if (runs === 1) await gate;
    });
    const first = task.run();
    const second = task.run();
    const third = task.run();
    expect(second).toBe(first);
    expect(third).toBe(first);
    release();
    await first;
    expect(runs).toBe(2); // 第一次，加补做的一次；三个请求不是三次
  });

  it("做完之后再请求是新的一轮", async () => {
    let runs = 0;
    const task = new Coalesced(async () => {
      runs += 1;
    });
    await task.run();
    await task.run();
    expect(runs).toBe(2);
  });
});
