import { describe, expect, it } from "vitest";
import { OutputBuffer } from "./output-buffer.ts";

const lines = (from: number, to: number): string =>
  Array.from({ length: to - from + 1 }, (_, i) => `${from + i}\r\n`).join("");

describe("终端输出的回滚缓冲", () => {
  it("没超过上限：原样保留，按顺序", () => {
    const buffer = new OutputBuffer(10);
    buffer.append("a\r\nb");
    buffer.append("c\r\n");
    expect(buffer.text()).toBe("a\r\nbc\r\n");
    expect(buffer.lines).toBe(2);
  });

  it("超过上限：只留最近的整行，更早的丢掉，不从一行中间开始", () => {
    const buffer = new OutputBuffer(5);
    buffer.append(lines(1, 12));
    expect(buffer.text()).toBe(lines(8, 12));
  });

  it("一个大块跨过上限、分很多块写入，结果相同", () => {
    const whole = new OutputBuffer(100);
    const pieces = new OutputBuffer(100);
    const all = lines(1, 5000);
    whole.append(all);
    for (let i = 0; i < all.length; i += 777) pieces.append(all.slice(i, i + 777));
    expect(pieces.text()).toBe(whole.text());
    expect(whole.text().startsWith("4901\r\n")).toBe(true);
  });

  it("20000 行只留最近 10000 行：最早一行是 10001，1 到 10000 都已丢掉", () => {
    const buffer = new OutputBuffer(10_000);
    for (let n = 1; n <= 20_000; n += 500) buffer.append(lines(n, n + 499));
    const kept = buffer
      .text()
      .split("\r\n")
      .filter((line) => line !== "");
    expect(kept).toHaveLength(10_000);
    expect(kept[0]).toBe("10001");
    expect(kept.at(-1)).toBe("20000");
  });

  it("清空之后重新记；没有换行的超长输出有总量上限，不无限增长", () => {
    const buffer = new OutputBuffer(10);
    buffer.append(lines(1, 5));
    buffer.clear();
    expect(buffer.text()).toBe("");
    expect(buffer.lines).toBe(0);
    const big = "x".repeat(4 * 1024 * 1024);
    for (let i = 0; i < 6; i++) buffer.append(big);
    expect(buffer.text().length).toBeLessThanOrEqual(16 * 1024 * 1024);
  });
});
