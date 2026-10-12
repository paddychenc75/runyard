import { describe, expect, it } from "vitest";
import type { CodeRegistries } from "../../packages/i18n/build/code-families.ts";
import { checkUnused, i18nUnused } from "./i18n-unused.ts";
import { makeI18nRepo } from "./test-helpers.ts";

const registries: CodeRegistries = {
  errors: {},
  notices: { RELOADING: { params: { shape: {} } } },
  runStates: [],
};
const catalogs = (zh: object, en: object) => ({
  "packages/i18n/locales/zh-CN/notice.json": zh,
  "packages/i18n/locales/en/notice.json": en,
});

describe("i18n-unused 检查", () => {
  it("好仓库通过：t() 引用、platform 被 term_ 引用都算用到", () => {
    expect(i18nUnused.run(makeI18nRepo())).toEqual([]);
  });

  it("文案里有、代码里没有用到的键", () => {
    const root = makeI18nRepo({
      "packages/i18n/src/use.ts": 't("library.empty.title"); t("library.summary.body", {});',
    });
    const errors = i18nUnused.run(root).join("\n");
    expect(errors).toContain("library.trash.action 没有被用到");
    expect(errors).not.toContain("library.empty.title");
  });

  it("只在测试里用到的键仍然是未使用", () => {
    const root = makeI18nRepo({
      "packages/i18n/src/use.ts": 't("library.empty.title"); t("library.summary.body", {});',
      "packages/i18n/src/x.test.ts": 't("library.trash.action");',
    });
    expect(i18nUnused.run(root).join()).toContain("library.trash.action");
  });

  it("platform 键没有被任何文案的 {term_} 引用", () => {
    const root = makeI18nRepo({
      "packages/i18n/locales/zh-CN/platform.json": {
        "platform.trash": "{platform, select, other {废纸篓}}",
        "platform.dock": "{platform, select, other {程序坞}}",
      },
      "packages/i18n/locales/en/platform.json": {
        "platform.trash": "{platform, select, other {Trash}}",
        "platform.dock": "{platform, select, other {Dock}}",
      },
    });
    expect(i18nUnused.run(root).join()).toContain("platform.dock 没有被用到");
  });

  it("登记表推出的键族算用到；登记表里没有的同前缀键照样是未使用（不能靠前缀豁免）", () => {
    const base = { "notice.RELOADING": "x" };
    expect(checkUnused(makeI18nRepo(catalogs(base, base)), registries).join()).not.toContain(
      "notice.",
    );
    const stale = { ...base, "notice.REMOVED": "x" };
    const errors = checkUnused(makeI18nRepo(catalogs(stale, stale)), registries).join("\n");
    expect(errors).toContain("notice.REMOVED 没有被用到");
    expect(errors).not.toContain("notice.RELOADING");
  });
});
