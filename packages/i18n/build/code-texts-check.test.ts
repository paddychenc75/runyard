import { errorRegistry, noticeRegistry, runStates } from "@runyard/protocol";
import { describe, expect, it } from "vitest";
import type { CodeRegistries } from "./code-families.ts";
import { checkCodeTexts, type Texts } from "./code-texts-check.ts";
import { loadCatalogs } from "./load-catalogs.ts";

// 用最小的假登记表（只有 shape / isOptional / options，和 zod 对象同形）测规则，
// 再用真实登记表和真实文案证明现状是绿的。

const required = { isOptional: () => false };
const optional = { isOptional: () => true, unwrap: () => ({}) };
const reasonEnum = { isOptional: () => false, options: ["timeout", "failed"] };

const registries: CodeRegistries = {
  errors: {
    NAME_EXISTS: { params: { shape: { name: required } } },
    OPEN: { params: { shape: {} } },
  },
  notices: {
    EXITED: { params: { shape: { exitCode: optional } } },
    ENV: { params: { shape: { reason: reasonEnum } } },
  },
  runStates: ["ready"],
};

const good = (locale: string): Record<string, string> => ({
  "errors.NAME_EXISTS.title": "{name}",
  "errors.NAME_EXISTS.body": "b",
  "errors.NAME_EXISTS.hint": "h",
  "errors.NAME_EXISTS.hintCli": "c",
  "errors.OPEN.title": "t",
  "errors.OPEN.body": "b",
  "errors.OPEN.hint": "h",
  "errors.OPEN.hintCli": "c",
  "notice.EXITED": `${locale}{exitCode, select, none {} other { {exitCode}}}`,
  "notice.ENV": "{reason, select, timeout {a} other {b}}",
  "runState.ready": "ready",
});
const texts = (patch: Record<string, string | null> = {}): Texts => {
  const en = { ...good("en") };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete en[key];
    else en[key] = value;
  }
  return { "zh-CN": good("zh"), en };
};
const messages = (problems: ReturnType<typeof checkCodeTexts>) =>
  problems.map((p) => `${p.locale} ${p.key} ${p.message}`).join("\n");

describe("checkCodeTexts", () => {
  it("每个代码都有文案、参数一致时通过", () => {
    expect(checkCodeTexts(texts(), registries)).toEqual([]);
  });

  it("某种语言缺一个登记的代码的文案", () => {
    const out = messages(checkCodeTexts(texts({ "notice.ENV": null }), registries));
    expect(out).toContain("en 缺少 notice.ENV 的文案");
  });

  it("文案里有登记表没有的代码", () => {
    const out = messages(checkCodeTexts(texts({ "errors.GONE.title": "x" }), registries));
    expect(out).toContain("errors.GONE.title");
    expect(out).toContain("登记表里没有对应的代码");
  });

  it("用了登记表没有的参数；错误码的必填参数四个字段里一个都没用", () => {
    const extra = messages(checkCodeTexts(texts({ "errors.OPEN.title": "{oops}" }), registries));
    expect(extra).toContain("用了登记表里没有的参数 {oops}");
    const missing = messages(
      checkCodeTexts(texts({ "errors.NAME_EXISTS.title": "没参数" }), registries),
    );
    expect(missing).toContain("没有用到必填参数 {name}");
  });

  it("可选参数必须写成带 none 分支的 select，并且只在 other 分支里引用", () => {
    const bare = messages(checkCodeTexts(texts({ "notice.EXITED": "码 {exitCode}" }), registries));
    expect(bare).toContain("可选参数 {exitCode} 没有按约定写");
    const leaked = messages(
      checkCodeTexts(
        texts({ "notice.EXITED": "{exitCode, select, none {} other {a}} {exitCode}" }),
        registries,
      ),
    );
    expect(leaked).toContain("可选参数 {exitCode} 没有按约定写");
    const noNone = messages(
      checkCodeTexts(texts({ "notice.EXITED": "{exitCode, select, other {x}}" }), registries),
    );
    expect(noNone).toContain("可选参数 {exitCode} 没有按约定写");
  });

  it("必填参数的 select 里写 none 分支是多余的", () => {
    const out = messages(
      checkCodeTexts(
        texts({ "errors.NAME_EXISTS.title": "{name, select, none {} other {x}}" }),
        registries,
      ),
    );
    expect(out).toContain("none 分支，它永远走不到");
  });

  it("枚举参数的 select 分支必须是登记的取值或 other", () => {
    const out = messages(
      checkCodeTexts(
        texts({ "notice.ENV": "{reason, select, timeout {a} bogus {c} other {b}}" }),
        registries,
      ),
    );
    expect(out).toContain("分支 bogus 不是登记的取值");
  });

  it("运行状态不许带参数", () => {
    expect(messages(checkCodeTexts(texts({ "runState.ready": "{x}" }), registries))).toContain(
      "用了登记表里没有的参数 {x}",
    );
  });
});

describe("真实的登记表和文案", () => {
  it("[codes] 每个错误码、提示码、运行状态在每种语言里都有文案，参数和登记表一致", () => {
    const { texts: real, problems } = loadCatalogs(`${import.meta.dirname}/..`);
    expect(problems).toEqual([]);
    expect(Object.keys(real).sort()).toEqual(["en", "zh-CN"]);
    const found = checkCodeTexts(real, {
      errors: errorRegistry,
      notices: noticeRegistry,
      runStates,
    });
    expect(messages(found)).toBe("");
  });
});
