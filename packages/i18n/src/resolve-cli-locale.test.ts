import { describe, expect, it } from "vitest";
import { type CliLocaleInput, resolveCliLocale } from "./resolve-cli-locale.ts";

// 表驱动：--lang > RUNYARD_LANG > 保存的设置 > 英文（PRD #prd-cli-language，技术设计 §5.3）
const cases: {
  name: string;
  input: CliLocaleInput;
  locale: "en" | "zh-CN";
  source: "flag" | "env" | "saved" | "default";
}[] = [
  { name: "都没有就是英文", input: {}, locale: "en", source: "default" },
  { name: "只有保存的设置", input: { saved: "zh-CN" }, locale: "zh-CN", source: "saved" },
  {
    name: "环境变量压过保存的设置",
    input: { env: "en", saved: "zh-CN" },
    locale: "en",
    source: "env",
  },
  { name: "只有环境变量", input: { env: "zh-CN" }, locale: "zh-CN", source: "env" },
  {
    name: "--lang 压过环境变量和保存的设置",
    input: { flag: "en", env: "zh-CN", saved: "zh-CN" },
    locale: "en",
    source: "flag",
  },
  {
    name: "--lang 选中文",
    input: { flag: "zh-CN", env: "en", saved: "en" },
    locale: "zh-CN",
    source: "flag",
  },
  {
    name: "空字符串当作没设，落到下一级",
    input: { flag: "", env: "", saved: "zh-CN" },
    locale: "zh-CN",
    source: "saved",
  },
  {
    name: "undefined 当作没设",
    input: { flag: undefined, env: undefined, saved: undefined },
    locale: "en",
    source: "default",
  },
];

describe("resolveCliLocale", () => {
  it.each(cases)("$name", ({ input, locale, source }) => {
    const result = resolveCliLocale(input);
    expect(result.locale).toBe(locale);
    expect(result.source).toBe(source);
    expect(result.unsupported).toBeUndefined();
  });

  const unsupportedCases: {
    name: string;
    input: CliLocaleInput;
    source: "flag" | "env" | "saved";
    value: string;
  }[] = [
    { name: "--lang 不认识", input: { flag: "fr" }, source: "flag", value: "fr" },
    { name: "环境变量不认识", input: { env: "zh_CN" }, source: "env", value: "zh_CN" },
    { name: "保存的设置不认识", input: { saved: "ja" }, source: "saved", value: "ja" },
    { name: "大小写不对也算不认识", input: { flag: "zh-cn" }, source: "flag", value: "zh-cn" },
    {
      name: "最高优先级不认识时不往下找，仍退回英文",
      input: { flag: "zh", env: "zh-CN", saved: "zh-CN" },
      source: "flag",
      value: "zh",
    },
  ];

  it.each(unsupportedCases)(
    "不认识的值退回英文并带需要提示的标记：$name",
    ({ input, source, value }) => {
      expect(resolveCliLocale(input)).toEqual({
        locale: "en",
        source,
        unsupported: { source, value },
      });
    },
  );
});
