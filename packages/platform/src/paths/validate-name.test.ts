import { describe, expect, it } from "vitest";
import type { NameProblem } from "../platform.ts";
import { MAX_NAME_LENGTH, validateName } from "./validate-name.ts";

const cases: [string, string, NameProblem | null][] = [
  ["普通名称", "demo", null],
  ["带数字和连字符", "react19-1", null],
  ["只有数字", "123", null],
  ["恰好 64 个字符", "a".repeat(64), null],
  ["65 个字符", "a".repeat(65), "too-long"],
  ["空串", "", "empty"],
  ["含大写", "My-App", "invalid-chars"],
  ["含空格", "My App", "invalid-chars"],
  ["含下划线", "demo_1", "invalid-chars"],
  ["含斜杠", "a/b", "invalid-chars"],
  ["含中文", "演示", "invalid-chars"],
  ["开头是连字符", "-demo", "edge-hyphen"],
  ["结尾是连字符", "demo-", "edge-hyphen"],
  ["保留名 con", "con", "reserved"],
  ["保留名 nul", "nul", "reserved"],
  ["保留名 prn", "prn", "reserved"],
  ["保留名 aux", "aux", "reserved"],
  ["保留名 com1", "com1", "reserved"],
  ["保留名 com9", "com9", "reserved"],
  ["保留名 lpt1", "lpt1", "reserved"],
  ["保留名 lpt9", "lpt9", "reserved"],
  ["保留名不分大小写", "CON", "reserved"],
  ["带扩展名的保留名", "CON.txt", "reserved"],
  ["带扩展名的 nul", "nul.tar.gz", "reserved"],
  ["保留名加末尾空格", "nul ", "reserved"],
  ["com0 不是保留名", "com0", null],
  ["com10 不是保留名", "com10", null],
  ["含保留名但不是它", "console", null],
  ["末尾是点", "demo.", "trailing-dot-or-space"],
  ["末尾是空格", "demo ", "trailing-dot-or-space"],
  ["末尾是多个点", "demo...", "trailing-dot-or-space"],
  ["中间有点", "demo.app", "invalid-chars"],
];

describe("validateName（所有系统一致）", () => {
  it.each(cases)("%s：%j", (_title, name, expected) => {
    expect(validateName(name)).toBe(expected);
  });

  it("长度上限是 64", () => {
    expect(MAX_NAME_LENGTH).toBe(64);
  });

  it("同一个名字总得到同一个答案", () => {
    for (const [, name] of cases) expect(validateName(name)).toBe(validateName(name));
  });
});
