import { describe, expect, it } from "vitest";
import { type Catalog, createTranslator } from "./create-translator.ts";
import { createFormat } from "./format.ts";
import type { MessageMap } from "./messages.ts";

const fixture: Catalog = {
  en: {
    "platform.trash": "{platform, select, other {Trash}}",
    "demo.title": "New playground",
    "demo.moveToTrash": "Move {name} to the {term_trash}?",
    "demo.rich": "Folder <code>{path}</code> is ready",
    "demo.englishOnly": "Only English",
    "format.relative.justNow": "just now",
  },
  "zh-CN": { "demo.title": "新建项目", "demo.rich": "文件夹 <code>{path}</code> 已就绪" },
};

interface Demo extends MessageMap {
  "demo.title": Record<never, never>;
  "demo.moveToTrash": { name: string };
  "demo.englishOnly": Record<never, never>;
  "demo.missing": Record<never, never>;
}

const make = (locale: "en" | "zh-CN" | "en-XA") =>
  createTranslator<Demo>({ locale, platform: "darwin", catalogs: [fixture] });

describe("伪语言 en-XA", () => {
  it("从英文文案生成，整句在 ⟦ ⟧ 里，参数原样填进去", () => {
    const { t } = make("en-XA");
    expect(t("demo.title")).toMatch(/^⟦.+⟧$/);
    expect(t("demo.title")).not.toBe("New playground");
    expect(t("demo.moveToTrash", { name: "my-app" })).toContain("my-app");
    expect(t("demo.moveToTrash", { name: "my-app" }).startsWith("⟦")).toBe(true);
  });

  it("中文里有的键也取英文来变（不取中文）", () => {
    expect(make("en-XA").t("demo.title")).not.toContain("新建");
  });

  it("键不存在时原样返回键，不包 ⟦ ⟧，让漏洞在页面扫描里显形", () => {
    expect(make("en-XA").t("demo.missing")).toBe("demo.missing");
  });

  it("格式化按英文走", () => {
    const translator = make("en-XA");
    expect(translator.locale).toBe("en");
    expect(createFormat(translator).number(1234)).toBe("1,234");
  });
});

describe("translator.rich", () => {
  it("标签变成调用方给的节点，文字和节点交替", () => {
    const parts = make("en").rich(
      "demo.rich",
      { path: "/a" },
      { code: (chunks) => ({ node: chunks }) },
    );
    expect(parts).toEqual(["Folder ", { node: ["/a"] }, " is ready"]);
  });

  it("没有标签时只有一段字符串；缺键返回键", () => {
    expect(make("zh-CN").rich("demo.title", {}, {})).toEqual(["新建项目"]);
    expect(make("en").rich("demo.nope", {}, {})).toEqual(["demo.nope"]);
  });
});
