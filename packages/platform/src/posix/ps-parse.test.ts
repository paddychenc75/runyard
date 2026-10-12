import { describe, expect, it } from "vitest";
import { parseLstart, parsePsList } from "./ps-parse.ts";

describe("parseLstart", () => {
  it("把 ps 的 lstart（UTC）转成毫秒", () => {
    expect(parseLstart("Mon Oct 12 03:38:34 2026")).toBe(Date.UTC(2026, 9, 12, 3, 38, 34));
  });

  it("个位数的日期前面有两个空格", () => {
    expect(parseLstart("Thu Oct  8 14:56:19 2026")).toBe(Date.UTC(2026, 9, 8, 14, 56, 19));
  });

  it("读不懂的返回 null", () => {
    expect(parseLstart("")).toBeNull();
    expect(parseLstart("not a date")).toBeNull();
    expect(parseLstart("Mon Foo 12 03:38:34 2026")).toBeNull();
  });
});

describe("parsePsList", () => {
  it("解析 pid、pgid 和启动时间，跳过读不懂的行", () => {
    const output = [
      "    1     1 Sat Oct  3 14:39:10 2026",
      "  125   125 Thu Oct  8 14:56:19 2026",
      "garbage",
      "",
      "  126   125 Thu Oct  8 14:56:20 2026",
    ].join("\n");
    expect(parsePsList(output)).toEqual([
      { pid: 1, pgid: 1, startTime: Date.UTC(2026, 9, 3, 14, 39, 10) },
      { pid: 125, pgid: 125, startTime: Date.UTC(2026, 9, 8, 14, 56, 19) },
      { pid: 126, pgid: 125, startTime: Date.UTC(2026, 9, 8, 14, 56, 20) },
    ]);
  });
});
