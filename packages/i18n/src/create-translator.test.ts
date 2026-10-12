import { describe, expect, it } from "vitest";
import { type Catalog, createTranslator } from "./create-translator.ts";
import type { MessageMap } from "./messages.ts";

// 夹具文案：只在这个测试里用，真实文案在 #22
const fixture: Catalog = {
  en: {
    "platform.trash": "{platform, select, other {Trash}}",
    "demo.summary": "{count, plural, one {# playground} other {# playgrounds}}, {running} running",
    "demo.moveToTrash": "Move {name} to the {term_trash}?",
    "demo.englishOnly": "Only in English",
    "demo.bold": "Run <b>{name}</b> now",
  },
  "zh-CN": {
    "platform.trash": "{platform, select, other {废纸篓}}",
    "demo.summary": "{count, plural, other {# 个项目}}，{running} 个在运行",
    "demo.moveToTrash": "把 {name} 移到{term_trash}？",
  },
};

interface DemoMessages extends MessageMap {
  "demo.summary": { count: number; running: number };
  "demo.moveToTrash": { name: string };
  "demo.englishOnly": Record<never, never>;
  "demo.bold": { name: string; b: (chunks: string[]) => string };
  "demo.unknown": Record<never, never>;
}

const make = (locale: "en" | "zh-CN") =>
  createTranslator<DemoMessages>({ locale, platform: "darwin", catalogs: [fixture] });

describe("createTranslator", () => {
  it("按语言取文案并填参数，复数写在文案里", () => {
    expect(make("en").t("demo.summary", { count: 1, running: 0 })).toBe("1 playground, 0 running");
    expect(make("en").t("demo.summary", { count: 3, running: 2 })).toBe("3 playgrounds, 2 running");
    expect(make("zh-CN").t("demo.summary", { count: 3, running: 2 })).toBe("3 个项目，2 个在运行");
  });

  it("term_ 参数由文案系统按系统自动填，调用的人不用传", () => {
    expect(make("en").t("demo.moveToTrash", { name: "pricing" })).toBe(
      "Move pricing to the Trash?",
    );
    expect(make("zh-CN").t("demo.moveToTrash", { name: "pricing" })).toBe(
      "把 pricing 移到废纸篓？",
    );
  });

  it("当前语言缺键时回退英文", () => {
    expect(make("zh-CN").t("demo.englishOnly")).toBe("Only in English");
  });

  it("两种语言都没有的键原样返回键，不抛错", () => {
    expect(make("zh-CN").t("demo.unknown")).toBe("demo.unknown");
  });

  it("标签函数把标签内的文字交给调用方处理", () => {
    const { t } = make("en");
    expect(t("demo.bold", { name: "app", b: (chunks) => `*${chunks.join("")}*` })).toBe(
      "Run *app* now",
    );
  });

  it("多份文案按顺序查找，译者可以拆成几个文件", () => {
    const extra: Catalog = { en: { "demo.extra": "extra" }, "zh-CN": { "demo.extra": "额外" } };
    const { t } = createTranslator<DemoMessages & { "demo.extra": Record<never, never> }>({
      locale: "zh-CN",
      platform: "darwin",
      catalogs: [fixture, extra],
    });
    expect(t("demo.extra")).toBe("额外");
  });

  it("暴露当前语言", () => {
    expect(make("zh-CN").locale).toBe("zh-CN");
  });
});
