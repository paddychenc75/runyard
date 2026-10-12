import { describe, expect, it } from "vitest";
import { parseVersionRange } from "./version-range.ts";

describe("版本范围的写法", () => {
  it.each([">=22.18 <27", ">=1.26", ">3 <=4.1.2", ">=22 >=22.18 <27", ">=3.12 <4"])(
    "%s 是合法的范围",
    (text) => {
      expect(parseVersionRange(text).ok).toBe(true);
    },
  );

  it.each([
    "latest",
    "^22",
    "~1.2",
    "22.x",
    "*",
    "",
    ">= 22",
    ">=22,<27",
    "=22",
    ">=22.18.0.1",
    ">=v22",
  ])("%j 写法不对", (text) => {
    expect(parseVersionRange(text)).toEqual({ ok: false, reason: "syntax" });
  });

  it("只有上限没有下限是另一种失败，便于给出不同的提示", () => {
    expect(parseVersionRange("<27")).toEqual({ ok: false, reason: "no-lower" });
    expect(parseVersionRange("<=27 <28")).toEqual({ ok: false, reason: "no-lower" });
  });

  it("说明有没有上限", () => {
    expect(parseVersionRange(">=22.18 <27")).toMatchObject({ ok: true, hasUpper: true });
    expect(parseVersionRange(">=1.26")).toMatchObject({ ok: true, hasUpper: false });
    expect(parseVersionRange(">=1 <=2")).toMatchObject({ ok: true, hasUpper: true });
  });
});
