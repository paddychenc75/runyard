import { describe, expect, it } from "vitest";
import { defaultName, nameProblem, parseCustomDays } from "./create-view.ts";

describe("新建弹窗的默认名称", () => {
  it("[DESKTOP-CREATE-FLOW-06] 已有 react19-1 和 react19-3 时默认 react19-4，不回头补空缺", () => {
    expect(defaultName("react19", ["react19-1", "react19-3"])).toBe("react19-4");
  });

  it("没有同名前缀的项目时从 1 开始；别的模板和不是纯数字序号的不算", () => {
    expect(defaultName("react19", [])).toBe("react19-1");
    expect(defaultName("react19", ["react18-9", "react19-x", "react19-2b", "react19"])).toBe(
      "react19-1",
    );
  });

  it("模板标识里本身有连字符时前缀按完整标识匹配", () => {
    expect(defaultName("node-ts", ["node-ts-2", "node-1"])).toBe("node-ts-3");
  });
});

describe("名称校验", () => {
  it("[DESKTOP-CREATE-FLOW-09] 与现有项目重名是 taken", () => {
    expect(nameProblem("demo", ["demo"])).toBe("taken");
    expect(nameProblem("demo-2", ["demo"])).toBeNull();
  });

  it("[DESKTOP-CREATE-FLOW-10] 大写、空格、首尾连字符、空串、超过 64 个字符都不合法", () => {
    for (const bad of ["My App", "", "-a", "a-", "a_b", "中文", "a".repeat(65)]) {
      expect(nameProblem(bad, [])).toBe("invalid");
    }
    expect(nameProblem("a".repeat(64), [])).toBeNull();
    expect(nameProblem("a", [])).toBeNull();
    expect(nameProblem("react19-4", [])).toBeNull();
  });
});

describe("自定义天数", () => {
  it("只认大于 0 的整数", () => {
    expect(parseCustomDays("14")).toBe(14);
    expect(parseCustomDays(" 5 ")).toBe(5);
    for (const bad of ["", "0", "-3", "1.5", "abc", "1e3"]) expect(parseCustomDays(bad)).toBeNull();
  });
});
