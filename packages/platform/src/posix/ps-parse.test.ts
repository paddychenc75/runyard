import { describe, expect, it } from "vitest";
import { hasEnvToken, parseLstart, parsePsList, parsePsWithEnv } from "./ps-parse.ts";

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

describe("hasEnvToken", () => {
  it("整词等于 name=value 才算，前后必须是空白或边界", () => {
    expect(
      hasEnvToken("node a.js HOME=/x RUNYARD_RUN_ID=run-1 PATH=/bin", "RUNYARD_RUN_ID", "run-1"),
    ).toBe(true);
    expect(hasEnvToken("RUNYARD_RUN_ID=run-1", "RUNYARD_RUN_ID", "run-1")).toBe(true);
    expect(hasEnvToken("a RUNYARD_RUN_ID=run-12", "RUNYARD_RUN_ID", "run-1")).toBe(false);
    expect(hasEnvToken("a XRUNYARD_RUN_ID=run-1", "RUNYARD_RUN_ID", "run-1")).toBe(false);
    expect(hasEnvToken("a MY_RUNYARD_RUN_ID=run-1 b", "RUNYARD_RUN_ID", "run-1")).toBe(false);
  });

  it("前面一处不是整词、后面一处才是：继续往后找", () => {
    expect(hasEnvToken("XA=1 A=1", "A", "1")).toBe(true);
  });

  it("值里有空格时按字面连续匹配", () => {
    expect(hasEnvToken("cmd N=1 M=a b c Z=2", "M", "a b c")).toBe(true);
  });
});

describe("parsePsWithEnv", () => {
  const out = [
    "  100   100 Mon Oct 12 03:38:34 2026 node server.js HOME=/Users/a RUNYARD_RUN_ID=run-3 TERM=xterm",
    "  101   100 Mon Oct 12 03:38:35 2026 /bin/sleep 5",
    "  102   102 Mon Oct 12 03:38:36 2026 node other.js RUNYARD_RUN_ID=run-30",
    "  103   103 Mon Oct 12 03:38:37 2026",
    "garbage line",
  ].join("\n");

  it("取出带标记的进程，其余的（含读不到环境的、只差一个字符的值）不取", () => {
    expect(parsePsWithEnv(out, "RUNYARD_RUN_ID", "run-3")).toEqual([
      { pid: 100, pgid: 100, startTime: Date.UTC(2026, 9, 12, 3, 38, 34) },
    ]);
  });
});
