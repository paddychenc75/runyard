import { describe, expect, it } from "vitest";
import { englishHas, i18nGlossary } from "./i18n-glossary.ts";
import { I18N_GOOD, makeI18nRepo } from "./test-helpers.ts";

const zhFile = "packages/i18n/locales/zh-CN/library.json";
const enFile = "packages/i18n/locales/en/library.json";
const zh = I18N_GOOD[zhFile] as Record<string, string>;
const en = I18N_GOOD[enFile] as Record<string, string>;
const run = (patch: Record<string, string | object | null>) =>
  i18nGlossary.run(makeI18nRepo(patch)).join("\n");

describe("i18n-glossary 检查", () => {
  it("好仓库通过（项目 ↔ playground 成对）", () => {
    expect(i18nGlossary.run(makeI18nRepo())).toEqual([]);
  });

  it("中文文案用了禁用的中文词", () => {
    expect(run({ [zhFile]: { ...zh, "library.empty.title": "还没有沙盒工程" } })).toContain(
      "用了禁用的词“沙盒工程”",
    );
  });

  it("英文文案用了禁用的英文词（按词匹配，不分大小写）", () => {
    expect(run({ [enFile]: { ...en, "library.empty.title": "No Sandboxy things" } })).toContain(
      "用了禁用的词“sandboxy”",
    );
  });

  it("中文有“项目”英文却没有 playground，反过来也一样", () => {
    expect(run({ [enFile]: { ...en, "library.empty.title": "Nothing yet" } })).toContain(
      "英文却没有 playground",
    );
    expect(run({ [zhFile]: { ...zh, "library.empty.title": "还没有" } })).toContain(
      "中文却没有“项目”",
    );
  });

  it("例外：写了 glossarySkip 和理由才放行，没写理由就报错", () => {
    const patch = { [enFile]: { ...en, "library.empty.title": "Nothing yet" } };
    const note = (extra: object) => ({
      "packages/i18n/locales/notes/library.json": {
        "library.summary.body": { count: "x" },
        "library.empty.title": { glossarySkip: ["项目"], ...extra },
      },
    });
    expect(run({ ...patch, ...note({ glossarySkipReason: "英文说的是整体" }) })).toBe("");
    expect(run({ ...patch, ...note({}) })).toContain("glossarySkip 没写理由");
  });

  it("术语表数据驱动：界面英文是“—”的术语不查成对，补上一格就开始查", () => {
    const glossary = (
      cell: string,
    ) => `| 中文术语 | 代码标识符 | 界面英文 | 禁用（中文） | 禁用（英文） | 出处 |
| --- | --- | --- | --- | --- | --- |
| 模板 | \`template\` | ${cell} | — | — | PRD |
`;
    const patch = { [zhFile]: { ...zh, "library.empty.title": "还没有模板" } };
    expect(run({ ...patch, "docs/glossary.md": glossary("—") })).toBe("");
    expect(run({ ...patch, "docs/glossary.md": glossary("template") })).toContain(
      "英文却没有 template",
    );
  });

  it("英文匹配容许复数，不匹配更长的词", () => {
    expect(englishHas("two playgrounds", ["playground"])).toBe(true);
    expect(englishHas("Libraries", ["library"])).toBe(true);
    expect(englishHas("running", ["run"])).toBe(false);
  });
});
