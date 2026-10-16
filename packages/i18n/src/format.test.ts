import { describe, expect, it } from "vitest";
import enFormat from "../locales/en/format.json" with { type: "json" };
import zhFormat from "../locales/zh-CN/format.json" with { type: "json" };
import { createTranslator } from "./create-translator.ts";
import { createFormat } from "./format.ts";
import type { Locale } from "./locale.ts";

// 这里是唯一断言真实文字的地方之一（其余测试断言键）
const make = (locale: Locale) =>
  createFormat(
    createTranslator({
      locale,
      platform: "darwin",
      catalogs: [{ en: enFormat, "zh-CN": zhFormat }],
    }),
  );
const en = make("en");
const zh = make("zh-CN");

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("format.number", () => {
  it("随语言加千分位", () => {
    expect(en.number(1234567)).toBe("1,234,567");
    expect(zh.number(1234567)).toBe("1,234,567");
    expect(en.number(0.5)).toBe("0.5");
  });
});

describe("format.fileSize", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1023, "1,023 B"],
    [1024, "1 KB"],
    [1536, "1.5 KB"],
    [1024 * 1024, "1 MB"],
    [5.25 * 1024 * 1024, "5.3 MB"],
    [1024 ** 3, "1 GB"],
    [1024 ** 4, "1 TB"],
    [1024 ** 5, "1,024 TB"],
  ])("%d 字节 → %s（B / KB / MB 不翻译，中间一个空格）", (bytes, text) => {
    expect(en.fileSize(bytes)).toBe(text);
    expect(zh.fileSize(bytes)).toBe(text);
  });

  it("接近进位边界时先进位，不出现 1,024 KB", () => {
    expect(en.fileSize(1024 * 1024 - 1)).toBe("1 MB");
  });

  it("拒绝负数和非有限数", () => {
    expect(() => en.fileSize(-1)).toThrow(RangeError);
    expect(() => en.fileSize(Number.NaN)).toThrow(RangeError);
  });
});

describe("format.technicalDuration", () => {
  it.each([
    [0, "0 ms"],
    [250, "250 ms"],
    [999.6, "1 s"],
    [1000, "1 s"],
    [1180, "1.2 s"],
    [75_000, "75 s"],
  ])("%d 毫秒 → %s（ms / s 不翻译）", (ms, text) => {
    expect(en.technicalDuration(ms)).toBe(text);
    expect(zh.technicalDuration(ms)).toBe(text);
  });
});

describe("format.humanDuration", () => {
  it.each([
    [0, "0 sec", "0 秒"],
    [45_000, "45 sec", "45 秒"],
    [59_600, "1 min", "1 分钟"],
    [30 * MIN, "30 min", "30 分钟"],
    [HOUR, "1 hr", "1 小时"],
    [5 * HOUR, "5 hr", "5 小时"],
    [DAY, "1 day", "1 天"],
    [3 * DAY, "3 days", "3 天"],
  ])("%d 毫秒", (ms, english, chinese) => {
    expect(en.humanDuration(ms)).toBe(english);
    expect(zh.humanDuration(ms)).toBe(chinese);
  });
});

describe("format.relativeTime", () => {
  const now = Date.UTC(2026, 9, 12, 12, 0, 0);

  it.each([
    [0, "just now", "刚刚"],
    [59_999, "just now", "刚刚"],
    [MIN, "1 min ago", "1 分钟前"],
    [2 * MIN, "2 min ago", "2 分钟前"],
    [59 * MIN, "59 min ago", "59 分钟前"],
    [HOUR, "1 hr ago", "1 小时前"],
    [23 * HOUR, "23 hr ago", "23 小时前"],
    [DAY, "1 day ago", "1 天前"],
    [3 * DAY, "3 days ago", "3 天前"],
    [45 * DAY, "45 days ago", "45 天前"],
  ])("相差 %d 毫秒", (diff, english, chinese) => {
    expect(en.relativeTime(now - diff, now)).toBe(english);
    expect(zh.relativeTime(now - diff, now)).toBe(chinese);
  });

  it("时间在未来（时钟偏差）按刚刚处理", () => {
    expect(en.relativeTime(now + HOUR, now)).toBe("just now");
  });
});

describe("format.date / dateTime", () => {
  // 正午 UTC：除了 UTC+12 以东的时区，本地日期都是同一天
  const noon = Date.UTC(2026, 9, 12, 12, 0, 0);

  it("日期随语言：英文 Oct 12, 2026，中文 2026年10月12日", () => {
    expect(en.date(noon)).toBe("Oct 12, 2026");
    expect(zh.date(noon)).toBe("2026年10月12日");
    expect(en.date(noon, "long")).toBe("October 12, 2026");
  });

  it("日期加时间带分钟", () => {
    expect(en.dateTime(noon)).toMatch(/^Oct 1[23], 2026(, | at )\d{1,2}:\d{2}\s?(AM|PM)$/);
    expect(zh.dateTime(noon)).toMatch(/^2026年10月1[23]日 \d{2}:\d{2}$/);
  });

  it("不是有限数字抛错（开发者诊断）", () => {
    expect(() => en.date(Number.NaN)).toThrow(RangeError);
    expect(() => en.dateTime(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
