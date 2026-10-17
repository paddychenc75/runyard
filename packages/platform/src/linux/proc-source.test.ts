import { describe, expect, it } from "vitest";
import { parseProcStat } from "./proc-source.ts";

// 真实的 /proc/<pid>/stat 一行（第 22 项 starttime 是 987654）
const line = (comm: string) =>
  `4242 (${comm}) S 1 4242 4242 0 -1 4194560 100 0 0 0 5 3 0 0 20 0 1 0 987654 12345678 900 18446744073709551615 1 1 0 0 0 0 0 0 0 0 0 0 17 2 0 0 0 0 0`;

describe("parseProcStat", () => {
  it("取进程组号和启动时间（节拍数乘 10 毫秒）", () => {
    expect(parseProcStat(line("node"))).toEqual({ pgid: 4242, startTime: 9_876_540, tty: 0 });
  });

  it("进程名里有空格和括号也不影响", () => {
    expect(parseProcStat(line("a) S 9 (b c"))).toEqual({
      pgid: 4242,
      startTime: 9_876_540,
      tty: 0,
    });
  });

  it("第 7 项 tty_nr 是控制终端的设备号（#340：按它认同一个终端里的进程）", () => {
    const withTty = line("zsh").replace("4242 4242 0 -1", "4242 4242 34817 4242");
    expect(parseProcStat(withTty)?.tty).toBe(34817);
  });

  it("读不懂的返回 null", () => {
    expect(parseProcStat("")).toBeNull();
    expect(parseProcStat("1 (x) S 1")).toBeNull();
  });
});
