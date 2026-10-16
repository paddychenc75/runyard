import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { T, type TProps } from "./index.ts";

// 类型测试：这个文件本身要通过 tsc -b。每个 @ts-expect-error 对应一种“写错了就该报错”的情形；
// 类型变松时指令“用不上”，tsc 会报错。
type Demo = {
  "demo.plain": { name: string };
  "demo.none": Record<never, never>;
  "demo.rich": { path: string; code: (chunks: string[]) => string };
};

describe("<T> 的属性类型", () => {
  it("参数和标签齐全通过", () => {
    const rich: TProps<"demo.rich", Demo> = {
      k: "demo.rich",
      values: { path: "/a" },
      components: { code: createElement("code") },
    };
    const plain: TProps<"demo.plain", Demo> = { k: "demo.plain", values: { name: "x" } };
    const none: TProps<"demo.none", Demo> = { k: "demo.none" };
    expect([rich.k, plain.k, none.k]).toHaveLength(3);
  });

  it("漏传参数是类型错误", () => {
    // @ts-expect-error 有参数的键不传 values，类型测试
    const missing: TProps<"demo.plain", Demo> = { k: "demo.plain" };
    expect(missing.k).toBe("demo.plain");
  });

  it("有标签的键漏传 components、或多传不存在的标签是类型错误", () => {
    // @ts-expect-error 缺 components，类型测试
    const noComponents: TProps<"demo.rich", Demo> = { k: "demo.rich", values: { path: "/a" } };
    const extra: TProps<"demo.rich", Demo> = {
      k: "demo.rich",
      values: { path: "/a" },
      // @ts-expect-error 没有这个标签，类型测试
      components: { code: createElement("code"), nope: createElement("b") },
    };
    expect([noComponents.k, extra.k]).toHaveLength(2);
  });

  it("键写错是类型错误（真实的键表）", () => {
    // @ts-expect-error 键拼错，类型测试
    createElement(T, { k: "desktop.library.titel" });
    expect(typeof T).toBe("function");
  });

  it("参数不能是标签函数的位置传普通值", () => {
    const bad: TProps<"demo.rich", Demo> = {
      k: "demo.rich",
      // @ts-expect-error values 里不能放标签，类型测试
      values: { path: "/a", code: () => "" },
      components: { code: createElement("code") },
    };
    expect(bad.k).toBe("demo.rich");
  });
});
