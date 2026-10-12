import { describe, expect, it } from "vitest";
import { generateMessagesTypes } from "./generate-messages-types.ts";

describe("generateMessagesTypes", () => {
  it("没有文案时生成空表", () => {
    expect(generateMessagesTypes({})).toContain(
      "export type CatalogMessages = Record<never, never>;",
    );
  });

  it("按键排序，参数按名字排序，无参数的键是空记录", () => {
    const output = generateMessagesTypes({
      "a.json": {
        "library.summary": "{count, plural, other {# 个}}，{running} 个",
        "library.empty.title": "还没有项目",
      },
    });
    expect(output).toContain(`  "library.empty.title": Record<never, never>;`);
    expect(output).toContain(
      `  "library.summary": {\n    count: number;\n    running: string | number;\n  };`,
    );
    expect(output.indexOf("library.empty.title")).toBeLessThan(output.indexOf("library.summary"));
  });

  it("错误码、提示码、运行状态三族不在这里生成，由 protocol 登记表推出", () => {
    const output = generateMessagesTypes({
      "errors.json": { "errors.NAME_EXISTS.title": "{name} 已存在" },
      "notice.json": { "notice.RELOADING": "重新加载" },
      "runState.json": { "runState.ready": "就绪" },
    });
    expect(output).not.toContain("NAME_EXISTS");
    expect(output).not.toContain("RELOADING");
    expect(output).not.toContain("runState");
  });

  it("同一个键出现在两个文件里时报错", () => {
    expect(() =>
      generateMessagesTypes({ "a.json": { "x.y.title": "甲" }, "b.json": { "x.y.title": "乙" } }),
    ).toThrow(/x\.y\.title/);
  });

  it("文案不是合法 ICU 时报错并指出文件和键", () => {
    expect(() => generateMessagesTypes({ "a.json": { "x.y.title": "{oops" } })).toThrow(
      /a\.json.*x\.y\.title/,
    );
  });

  it("不是合法标识符的参数名加引号", () => {
    expect(generateMessagesTypes({ "a.json": { "x.y.body": "{0} 和 {1}" } })).toContain(
      `    "0": string | number;`,
    );
  });
});
