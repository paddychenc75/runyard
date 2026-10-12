import { describe, expect, it } from "vitest";
import { paramTypesOf } from "./icu-params.ts";

const toObject = (message: string) => Object.fromEntries(paramTypesOf(message));

describe("paramTypesOf", () => {
  it("没有参数的文案得到空表", () => {
    expect(toObject("还没有项目")).toEqual({});
  });

  it("普通参数是字符串或数字", () => {
    expect(toObject("把 {name} 移到废纸篓")).toEqual({ name: "string | number" });
  });

  it("复数参数是数字，分支里的参数一并收集", () => {
    expect(toObject("{count, plural, one {# 个，{running} 在运行} other {# 个}}")).toEqual({
      count: "number",
      running: "string | number",
    });
  });

  it("select 参数是字符串，number / date 参数有各自的类型", () => {
    expect(toObject("{kind, select, a {A} other {B}}")).toEqual({ kind: "string" });
    expect(toObject("{n, number} {when, date}")).toEqual({ n: "number", when: "number | Date" });
  });

  it("标签参数是函数", () => {
    expect(toObject("按 <kbd>回车</kbd> 创建 <b>{name}</b>")).toEqual({
      kbd: "(chunks: string[]) => string",
      b: "(chunks: string[]) => string",
      name: "string | number",
    });
  });

  it("platform 和 term_ 参数由文案系统自动填，不进参数表", () => {
    expect(toObject("把 {name} 移到{term_trash}（{platform}）")).toEqual({
      name: "string | number",
    });
  });

  it("同一个参数用成互相冲突的类型时报错", () => {
    expect(() => paramTypesOf("{x, number} {x, date}")).toThrow(/参数 x/);
  });

  it("不合法的 ICU 文案报错", () => {
    expect(() => paramTypesOf("{count, plural, other {#}")).toThrow();
  });
});
