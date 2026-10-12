import { GLOSSARY_FILE, readText } from "./docs.ts";
import {
  fallbackLocale,
  type LoadedCatalogs,
  readCatalogs,
  sourceLocale,
} from "./i18n-catalogs.ts";
import { literalTexts } from "./i18n-text.ts";
import { parseGlossary, type Term } from "./terms.ts";
import type { Check } from "./workspace.ts";

// i18n-glossary：文案用的术语和 docs/glossary.md 一致（技术设计 §6.8“和术语表联动”）。
// 词表只有一个出处：术语表。规则：
// 1. 中文文案不许出现“禁用（中文）”里的词，英文文案不许出现“禁用（英文）”里的词（各查各的）；
// 2. 术语表给了“界面英文”的术语必须成对：一个键的中文里有“项目”，英文里就要有 playground，反过来也一样；
// 3. 确实不该成对的键，在 locales/notes/ 里写 "glossarySkip": ["项目"] 和 "glossarySkipReason": "理由"，理由必填。
// “界面英文”一列是“—”的术语不查成对：要启用，在术语表里补那一格，不用改检查。
// 内置模板的 template.json 和网站的界面文字等它们出现时加入同一份规则。

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 英文按词匹配，容许复数（playground → playgrounds，library → libraries）
export function englishHas(text: string, forms: string[]): boolean {
  return forms.some((form) => {
    const stems = [`${escapeRegex(form)}(?:s|es)?`];
    if (form.endsWith("y")) stems.push(`${escapeRegex(form.slice(0, -1))}ies`);
    return new RegExp(`(?<![A-Za-z])(?:${stems.join("|")})(?![A-Za-z])`, "i").test(text);
  });
}

export function checkGlossary(c: LoadedCatalogs, terms: Term[]): string[] {
  const errors: string[] = [];
  const zhTexts = c.texts[sourceLocale] ?? {};
  const enTexts = c.texts[fallbackLocale] ?? {};
  const all = (message: string | undefined) =>
    message === undefined ? "" : literalTexts(message).join("\n");
  for (const [key, zhMessage] of Object.entries(zhTexts)) {
    const zh = all(zhMessage);
    const en = all(enTexts[key]);
    const where = c.files[sourceLocale]?.[key] ?? key;
    const note = c.notes[key];
    for (const term of terms) {
      for (const word of term.bannedZh) {
        if (zh.includes(word)) {
          errors.push(
            `${where} 的 ${key} 中文用了禁用的词“${word}”。统一的说法是“${term.zh}”（见 ${GLOSSARY_FILE}）。`,
          );
        }
      }
      for (const word of term.bannedEn) {
        if (englishHas(en, [word])) {
          errors.push(
            `${c.files[fallbackLocale]?.[key] ?? key} 的 ${key} 英文用了禁用的词“${word}”。统一的说法是 ${term.en.join("/") || term.id}（见 ${GLOSSARY_FILE}）。`,
          );
        }
      }
      if (term.en.length === 0 || enTexts[key] === undefined) continue;
      const zhHas = zh.includes(term.zh);
      const enHas = englishHas(en, term.en);
      if (zhHas === enHas) continue;
      if (note?.glossarySkip?.includes(term.zh)) {
        if ((note.glossarySkipReason ?? "").trim() === "") {
          errors.push(
            `locales/notes/ 里 ${key} 的 glossarySkip 没写理由。加上 "glossarySkipReason": "为什么这条不成对"。`,
          );
        }
        continue;
      }
      errors.push(
        zhHas
          ? `${key} 的中文用了“${term.zh}”，英文却没有 ${term.en.join("/")}。英文改用术语表的词；确实不该成对，在 locales/notes/ 写 "glossarySkip": ["${term.zh}"] 和 glossarySkipReason。`
          : `${key} 的英文用了 ${term.en.join("/")}，中文却没有“${term.zh}”。中文改用术语表的词；确实不该成对，在 locales/notes/ 写 "glossarySkip": ["${term.zh}"] 和 glossarySkipReason。`,
      );
    }
  }
  return errors;
}

export const i18nGlossary: Check = {
  name: "i18n-glossary",
  run(root) {
    let glossary: string;
    try {
      glossary = readText(root, GLOSSARY_FILE);
    } catch {
      return [`找不到 ${GLOSSARY_FILE}。术语表是用词的唯一出处，恢复这个文件。`];
    }
    const parsed = parseGlossary(glossary);
    return [...parsed.errors, ...checkGlossary(readCatalogs(root), parsed.terms)];
  },
};
