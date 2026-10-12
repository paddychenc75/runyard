import { flatVariants, PARAM_MARK } from "../../packages/i18n/build/icu-structure.ts";
import { type LoadedCatalogs, readCatalogs } from "./i18n-catalogs.ts";
import { literalTexts } from "./i18n-text.ts";
import type { Check } from "./workspace.ts";

// i18n-wording：措辞规则，只做技术设计 §6.8 写明的四条，不多不少：
// 1. 系统用词（废纸篓、访达、Finder、⌘ 等）只许出现在 platform.json（platform.* 键）里，别处写 {term_trash} 这类占位符；
// 2. 中文里汉字紧挨英文字母、数字或 {参数}（含复数里的 #）而中间没有空格；{term_*} 渲染的是一个词，不算；
// 3. 英文文案里出现全角标点；
// 4. 中文句末用了半角句号。
// 设计没有规定感叹号、英文句首大写之类的规则，所以这里不查。

const SYSTEM_WORDS_ZH = ["废纸篓", "回收站", "访达", "文件资源管理器", "程序坞", "任务栏", "⌘"];
const SYSTEM_WORDS_LATIN = [
  "Finder",
  "Trash",
  "Recycle Bin",
  "File Explorer",
  "Dock",
  "Ctrl",
  "Cmd",
];
const HAN = "\\u4e00-\\u9fff";
const SPACING = new RegExp(`[${HAN}][A-Za-z0-9${PARAM_MARK}]|[A-Za-z0-9${PARAM_MARK}][${HAN}]`);
const FULLWIDTH = /[　-〿＀-￯]/;
const isChinese = (locale: string) => locale.toLowerCase().startsWith("zh");
const visible = (variant: string) =>
  variant.replaceAll(PARAM_MARK, "{…}").replaceAll("", "{term}");

export function checkWording(c: LoadedCatalogs): string[] {
  const errors: string[] = [];
  for (const [locale, texts] of Object.entries(c.texts)) {
    for (const [key, message] of Object.entries(texts)) {
      const where = `${c.files[locale]?.[key] ?? key} 的 ${key}`;
      let variants: string[];
      try {
        variants = flatVariants(message);
      } catch {
        continue;
      }
      const literal = literalTexts(message).join("\n");
      if (!key.startsWith("platform.")) {
        const hit = [
          ...SYSTEM_WORDS_ZH.filter((word) => literal.includes(word)),
          ...SYSTEM_WORDS_LATIN.filter((word) =>
            new RegExp(`(?<![A-Za-z])${word}(?![A-Za-z])`).test(literal),
          ),
        ];
        for (const word of new Set(hit)) {
          errors.push(
            `${where} 直接写了系统用词“${word}”。它随系统变：在 platform.json 里定义，这里写 {term_trash}、{term_fileManager} 这样的占位符；快捷键用 <kbd></kbd>。`,
          );
        }
      }
      if (isChinese(locale)) {
        const bad = variants.find((variant) => SPACING.test(variant));
        if (bad !== undefined) {
          errors.push(
            `${where} 里汉字紧挨英文字母、数字或参数（“${visible(bad)}”）。在它们之间加一个半角空格。`,
          );
        }
        if (/\p{Script=Han}/u.test(literal) && variants.some((variant) => variant.endsWith("."))) {
          errors.push(`${where} 以半角句号结尾。中文句末用全角的“。”。`);
        }
      } else {
        const found = literal.match(FULLWIDTH)?.[0];
        if (found !== undefined) {
          errors.push(`${where} 的英文里有全角标点“${found}”。英文文案只用半角标点。`);
        }
      }
    }
  }
  return errors;
}

export const i18nWording: Check = {
  name: "i18n-wording",
  run: (root) => checkWording(readCatalogs(root)),
};
