import { describe, expect, it } from "vitest";
import { i18nKeys, keyNameProblem } from "./i18n-keys.ts";
import { I18N_GOOD, makeI18nRepo } from "./test-helpers.ts";

const zhFile = "packages/i18n/locales/zh-CN/library.json";
const enFile = "packages/i18n/locales/en/library.json";
const zh = I18N_GOOD[zhFile] as Record<string, string>;
const en = I18N_GOOD[enFile] as Record<string, string>;
const run = (patch: Record<string, string | object | null>) =>
  i18nKeys.run(makeI18nRepo(patch)).join("\n");

describe("i18n-keys 检查", () => {
  it("好仓库通过", () => {
    expect(i18nKeys.run(makeI18nRepo())).toEqual([]);
  });

  it("英文缺一个键、英文多一个键", () => {
    const { "library.empty.title": _gone, ...rest } = en;
    expect(run({ [enFile]: rest })).toContain("缺少 library.empty.title");
    expect(run({ [enFile]: { ...en, "library.extra.title": "x" } })).toContain(
      "library.extra.title 在中文里没有",
    );
  });

  it("文案不是合法 ICU", () => {
    expect(run({ [zhFile]: { ...zh, "library.empty.title": "{oops" } })).toContain(
      "不是合法的 ICU",
    );
  });

  it("两种语言的参数名或类型不一致", () => {
    expect(
      run({ [enFile]: { ...en, "library.summary.body": "{n, plural, one {#} other {#}}" } }),
    ).toContain("参数 {count} 只出现在 zh-CN 里");
    expect(run({ [enFile]: { ...en, "library.summary.body": "{count} items" } })).toContain(
      "参数类型必须一致",
    );
  });

  it("复数缺该语言必需的类别（英文要 one 和 other）", () => {
    expect(
      run({ [enFile]: { ...en, "library.summary.body": "{count, plural, other {# items}}" } }),
    ).toContain("缺少 en 必需的类别：one");
  });

  it("带参数的键没有备注；备注指向不存在的键或参数", () => {
    expect(run({ "packages/i18n/locales/notes/library.json": {} })).toContain("没有备注");
    expect(
      run({
        "packages/i18n/locales/notes/library.json": {
          "library.summary.body": { count: "x" },
          "library.gone.title": { a: "b" },
        },
      }),
    ).toContain("没有这个键");
    expect(
      run({
        "packages/i18n/locales/notes/library.json": {
          "library.summary.body": { count: "x", extra: "y" },
        },
      }),
    ).toContain("备注 extra 对应的参数在文案里不存在");
  });

  it("超过备注里的字数上限", () => {
    expect(
      run({
        "packages/i18n/locales/notes/library.json": {
          "library.summary.body": { count: "x", max: 3 },
        },
      }),
    ).toContain("超过备注里的上限 3");
  });

  it("键名不合规则", () => {
    expect(keyNameProblem("library.empty")).toContain("3 到 4 段");
    expect(keyNameProblem("library.Empty.title")).toContain("小驼峰");
    expect(keyNameProblem("library.empty.text")).toContain("固定的词结尾");
    expect(keyNameProblem("library.empty.title")).toBeUndefined();
    expect(keyNameProblem("errors.NAME_EXISTS.title")).toBeUndefined();
    expect(keyNameProblem("platform.trash")).toBeUndefined();
    expect(
      run({
        [zhFile]: { ...zh, "library.empty.text": "x" },
        [enFile]: { ...en, "library.empty.text": "x" },
      }),
    ).toContain("固定的词结尾");
  });

  it("空文案、首尾空白", () => {
    expect(run({ [zhFile]: { ...zh, "library.empty.title": " 空 " } })).toContain("首尾有空白");
  });

  it("代码引用了不存在的键，或用拼出来的键", () => {
    expect(
      run({
        "packages/i18n/src/use.ts": `t("library.nope.title"); t("library.empty.title"); t("library.summary.body"); t("library.trash.action");`,
      }),
    ).toContain("引用了不存在的键 library.nope.title");
    const dynamic = run({
      "packages/i18n/src/use.ts": `const k = "x"; t(\`library.${["$", "{k}"].join("")}.title\`); t("errors." + k);`,
    });
    expect(dynamic).toContain('以 "library." 开头');
    expect(dynamic).not.toContain('"errors."');
  });

  it("测试文件里的引用不算，也不报缺失", () => {
    expect(
      i18nKeys.run(makeI18nRepo({ "packages/i18n/src/x.test.ts": 't("nope.nope.title");' })),
    ).toEqual([]);
  });
});
