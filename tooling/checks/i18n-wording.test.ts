import { describe, expect, it } from "vitest";
import { i18nWording } from "./i18n-wording.ts";
import { I18N_GOOD, makeI18nRepo } from "./test-helpers.ts";

const zhFile = "packages/i18n/locales/zh-CN/library.json";
const enFile = "packages/i18n/locales/en/library.json";
const zh = I18N_GOOD[zhFile] as Record<string, string>;
const en = I18N_GOOD[enFile] as Record<string, string>;
const runZh = (key: string, text: string) =>
  i18nWording.run(makeI18nRepo({ [zhFile]: { ...zh, [key]: text } })).join("\n");
const runEn = (key: string, text: string) =>
  i18nWording.run(makeI18nRepo({ [enFile]: { ...en, [key]: text } })).join("\n");

describe("i18n-wording 检查", () => {
  it("好仓库通过：{term_trash} 紧挨汉字不算，platform.json 里可以写系统用词", () => {
    expect(i18nWording.run(makeI18nRepo())).toEqual([]);
  });

  it("系统用词出现在 platform.json 之外（中英文）", () => {
    expect(runZh("library.empty.title", "移到废纸篓")).toContain("系统用词“废纸篓”");
    expect(runZh("library.empty.title", "在 Finder 里显示")).toContain("系统用词“Finder”");
    expect(runEn("library.empty.title", "Move to the Trash")).toContain("系统用词“Trash”");
    expect(runEn("library.empty.title", "Press Cmd+K")).toContain("系统用词“Cmd”");
    expect(runEn("library.empty.title", "Docker is fine")).toBe("");
  });

  it("中文里汉字紧挨英文字母、数字或参数", () => {
    expect(runZh("library.empty.title", "用Node运行")).toContain("汉字紧挨");
    expect(runZh("library.empty.title", "共3个")).toContain("汉字紧挨");
    expect(runZh("library.empty.title", "项目{name}已存在")).toContain("汉字紧挨");
    expect(runZh("library.empty.title", "共 {count, plural, other {#个}}")).toContain("汉字紧挨");
    expect(runZh("library.empty.title", "项目 {name} 已存在")).toBe("");
  });

  it("英文里出现全角标点", () => {
    expect(runEn("library.empty.title", "No playgrounds，yet")).toContain("全角标点“，”");
  });

  it("中文句末用了半角句号", () => {
    expect(runZh("library.empty.title", "没有项目.")).toContain("半角句号");
    expect(runZh("library.empty.title", "没有项目。")).toBe("");
    expect(runEn("library.empty.title", "No playgrounds.")).toBe("");
  });
});
