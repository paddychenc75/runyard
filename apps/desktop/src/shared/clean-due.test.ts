import { describe, expect, it } from "vitest";
import { DAY_MS, idleDaysOf, isDueTomorrow } from "./clean-due.ts";

const HOUR = 60 * 60 * 1000;
const NOW = 100 * DAY_MS;
const row = (
  usedAgoMs: number,
  extra: { missing?: boolean; days?: number | null; on?: boolean } = {},
) => ({
  autoClean: { enabled: extra.on ?? true, days: extra.days === undefined ? 30 : extra.days },
  lastUsedAt: NOW - usedAgoMs,
  missing: extra.missing ?? false,
});

describe("明天清理的判断（和管理进程同一条规则：离清理时间不足 24 小时）", () => {
  it("[DESKTOP-LIBRARY-VIEW-57] 离清理时间 23 小时 59 分：明天清理；24 小时 01 分：还不是", () => {
    expect(isDueTomorrow(row(30 * DAY_MS - 24 * HOUR + 60_000), NOW)).toBe(true);
    expect(isDueTomorrow(row(30 * DAY_MS - 24 * HOUR - 60_000), NOW)).toBe(false);
  });

  it("[DESKTOP-LIBRARY-VIEW-57] 刚好 24 小时不算（管理进程是严格小于）；已到期但还没清理的算", () => {
    expect(isDueTomorrow(row(30 * DAY_MS - 24 * HOUR), NOW)).toBe(false);
    expect(isDueTomorrow(row(31 * DAY_MS), NOW)).toBe(true);
  });

  it("已保留、没记天数、找不到文件夹的项目不参与", () => {
    expect(isDueTomorrow(row(40 * DAY_MS, { on: false }), NOW)).toBe(false);
    expect(isDueTomorrow(row(40 * DAY_MS, { days: null }), NOW)).toBe(false);
    expect(isDueTomorrow(row(40 * DAY_MS, { missing: true }), NOW)).toBe(false);
  });

  it("已经几天没打开按整天算", () => {
    expect(idleDaysOf({ lastUsedAt: NOW - 29 * DAY_MS - HOUR }, NOW)).toBe(29);
  });
});
