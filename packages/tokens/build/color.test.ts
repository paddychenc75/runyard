import { describe, expect, it } from "vitest";
import { toHex } from "./color.ts";

describe("toHex", () => {
  it("#RRGGBB 统一成大写", () => {
    expect(toHex("#0071e3")).toBe("#0071E3");
  });

  it("rgba 变成 #RRGGBBAA，透明度四舍五入到 0 到 255", () => {
    expect(toHex("rgba(0, 113, 227, 0.07)")).toBe("#0071E312");
    expect(toHex("rgba(255, 255, 255, 0.5)")).toBe("#FFFFFF80");
  });

  it("不透明的 rgba 省略透明度", () => {
    expect(toHex("rgba(10, 20, 30, 1)")).toBe("#0A141E");
  });

  it("不认识的写法直接报错", () => {
    expect(() => toHex("red")).toThrow("不认识的颜色写法");
  });
});
