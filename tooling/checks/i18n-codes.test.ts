import { describe, expect, it } from "vitest";
import type { CodeRegistries } from "../../packages/i18n/build/code-families.ts";
import { checkCodes, i18nCodes } from "./i18n-codes.ts";
import { makeI18nRepo } from "./test-helpers.ts";

const required = { isOptional: () => false };
const registries: CodeRegistries = {
  errors: { NAME_EXISTS: { params: { shape: { name: required } } } },
  notices: { RELOADING: { params: { shape: {} } } },
  runStates: ["ready"],
};
const fields = ["title", "body", "hint", "hintCli"];
const texts = (extra: Record<string, string> = {}) => ({
  ...Object.fromEntries(
    fields.map((f) => [`errors.NAME_EXISTS.${f}`, f === "title" ? "{name}" : "x"]),
  ),
  "notice.RELOADING": "重载",
  "runState.ready": "就绪",
  ...extra,
});

describe("i18n-codes 检查", () => {
  const good = () =>
    makeI18nRepo({
      "packages/i18n/locales/zh-CN/errors.json": texts(),
      "packages/i18n/locales/en/errors.json": texts({ "notice.RELOADING": "Reloading" }),
    });

  it("登记表里每个代码在每种语言里都有文案时通过", () => {
    expect(checkCodes(good(), registries)).toEqual([]);
  });

  it("英文缺一个登记的代码（用真实登记表：好仓库里一个都没有，全报缺失）", () => {
    const errors = i18nCodes.run(makeI18nRepo()).join("\n");
    expect(errors).toContain("缺少 errors.NAME_EXISTS.title 的文案");
    expect(errors).toContain("缺少 runState.ready 的文案");
  });

  it("英文缺文案、多出登记表没有的代码", () => {
    const root = makeI18nRepo({
      "packages/i18n/locales/zh-CN/errors.json": texts(),
      "packages/i18n/locales/en/errors.json": {
        ...texts(),
        "errors.GONE.title": "x",
        "notice.RELOADING": undefined as never,
      },
    });
    const errors = checkCodes(root, registries).join("\n");
    expect(errors).toContain("登记表里没有对应的代码");
    expect(errors).toContain("en 缺少 notice.RELOADING 的文案");
  });

  it("文案用了登记表没有的参数", () => {
    const root = makeI18nRepo({
      "packages/i18n/locales/zh-CN/errors.json": texts({ "runState.ready": "{x}" }),
      "packages/i18n/locales/en/errors.json": texts(),
    });
    expect(checkCodes(root, registries).join("\n")).toContain("用了登记表里没有的参数 {x}");
  });
});
