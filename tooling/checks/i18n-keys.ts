import { codeKeyOf } from "../../packages/i18n/build/code-families.ts";
import { paramTypesOf } from "../../packages/i18n/build/icu-params.ts";
import { flatVariants, literalOnly, pluralUses } from "../../packages/i18n/build/icu-structure.ts";
import {
  fallbackLocale,
  type LoadedCatalogs,
  locales,
  readCatalogs,
  sourceLocale,
} from "./i18n-catalogs.ts";
import { isFamilyHead, scanRepoReferences } from "./i18n-references.ts";
import type { Check } from "./workspace.ts";

// i18n-keys（技术设计 §6.8“其余国际化检查”）：
// 两种语言的键一致；文案是合法 ICU；同一个键两种语言的参数名和类型一致；复数有该语言必需的类别；
// 带参数的键有备注；不超过备注里的字数上限；键名合规；代码里引用的键存在。
// “代码里引用”只认静态引用，定义见 i18n-references.ts。

const FIXED_ENDINGS = [
  "title",
  "body",
  "action",
  "label",
  "placeholder",
  "hint",
  "aria",
  "tooltip",
];
// 这两组不是界面元素的文案：platform 是系统用词（platform.trash），format 是数字和时长的写法，
// 设计里它们的键就是两段或按单位命名，所以只查驼峰和段数，不要求以固定词结尾
const FREE_ENDING_GROUPS = ["platform", "format"];
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

export function keyNameProblem(key: string): string | undefined {
  if (codeKeyOf(key)) return undefined; // 键由登记表决定，见 i18n-codes
  const parts = key.split(".");
  const free = FREE_ENDING_GROUPS.includes(parts[0] ?? "");
  if (parts.length < (free ? 2 : 3) || parts.length > 4) {
    return `键名 ${key} 有 ${parts.length} 段。键名是 <组>.<区域>.<元素>[.<变体>]，${free ? "2 到 4" : "3 到 4"} 段。`;
  }
  if (!parts.every((part) => CAMEL.test(part))) {
    return `键名 ${key} 的每一段都要是小驼峰（小写字母开头，只含字母和数字）。`;
  }
  if (!free && !FIXED_ENDINGS.includes(parts.at(-1) ?? "")) {
    return `键名 ${key} 要以固定的词结尾：${FIXED_ENDINGS.join("、")}。`;
  }
  return undefined;
}

const fix = "见 docs/guides/add-ui-string.md";

export function checkCatalogs(c: LoadedCatalogs): string[] {
  const errors: string[] = [...c.problems];
  const source = c.texts[sourceLocale];
  for (const locale of locales) {
    if (c.texts[locale] === undefined) {
      errors.push(
        `缺少 packages/i18n/locales/${locale}/ 目录。语言列表在 packages/i18n/src/locale.ts，每种语言都要有文案目录。`,
      );
    }
  }
  for (const locale of Object.keys(c.texts)) {
    if (!(locales as readonly string[]).includes(locale)) {
      errors.push(
        `packages/i18n/locales/${locale}/ 不在语言列表里。先在 packages/i18n/src/locale.ts 加这种语言，或删掉这个目录。`,
      );
    }
  }
  if (source === undefined) return errors;

  for (const [locale, texts] of Object.entries(c.texts)) {
    for (const [key, message] of Object.entries(texts)) {
      const where = c.files[locale]?.[key] ?? locale;
      if (message.trim() === "" || message !== message.trim()) {
        errors.push(`${where} 的 ${key} 是空的，或首尾有空白。写成有内容、首尾无空白的文案。`);
      }
      try {
        paramTypesOf(message);
      } catch (error) {
        errors.push(
          `${where} 的 ${key} 不是合法的 ICU 文案或参数用法冲突（${String(error).split("\n")[0]}）。修正花括号和参数用法。`,
        );
        continue;
      }
      for (const use of pluralUses(message)) {
        const required = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
        const missing = required.filter((category) => !use.options.includes(category));
        if (missing.length > 0) {
          errors.push(
            `${where} 的 ${key} 里 {${use.name}, plural} 缺少 ${locale} 必需的类别：${missing.join("、")}。补上这些分支（中文只要 other，英文要 one 和 other）。`,
          );
        }
      }
      const problem = keyNameProblem(key);
      if (problem !== undefined) errors.push(`${where}：${problem}${fix}。`);
    }
    if (locale === sourceLocale) continue;
    for (const key of Object.keys(source)) {
      if (!(key in texts)) {
        errors.push(
          `locales/${locale}/ 缺少 ${key}（中文有）。在同一个 PR 里补上 ${locale} 的文案，${fix}。`,
        );
      }
    }
    for (const key of Object.keys(texts)) {
      if (!(key in source)) {
        errors.push(
          `${c.files[locale]?.[key] ?? locale} 的 ${key} 在中文里没有。中文是源语言：先在 locales/${sourceLocale}/ 补中文，或删掉这条。`,
        );
      }
    }
  }

  // 参数名和类型：以中文为准，逐个语言对照（复数、选择的分支结构允许不同）
  for (const [key, zh] of Object.entries(source)) {
    let zhParams: Map<string, string>;
    try {
      zhParams = paramTypesOf(zh);
    } catch {
      continue;
    }
    for (const [locale, texts] of Object.entries(c.texts)) {
      const other = texts[key];
      if (locale === sourceLocale || other === undefined) continue;
      let params: Map<string, string>;
      try {
        params = paramTypesOf(other);
      } catch {
        continue;
      }
      const names = new Set([...zhParams.keys(), ...params.keys()]);
      for (const name of names) {
        const a = zhParams.get(name);
        const b = params.get(name);
        if (a === undefined || b === undefined) {
          errors.push(
            `${key} 的参数 {${name}} 只出现在 ${a === undefined ? locale : sourceLocale} 里。两种语言的参数名必须一致。`,
          );
        } else if (a !== b) {
          errors.push(
            `${key} 的参数 {${name}} 在 ${sourceLocale} 里是 ${a}，在 ${locale} 里是 ${b}。参数类型必须一致。`,
          );
        }
      }
    }
    // 备注：带参数的键每个参数一条说明
    const note = c.notes[key];
    for (const name of zhParams.keys()) {
      if (note?.params[name] === undefined) {
        errors.push(
          `${c.files[sourceLocale]?.[key] ?? key} 的 ${key} 有参数 {${name}} 但没有备注。在 locales/notes/<组>.json 里写 "${key}": { "${name}": "这个参数是什么" }。`,
        );
      }
    }
  }
  const allKeys = new Set(Object.values(c.texts).flatMap((texts) => Object.keys(texts)));
  for (const [key, note] of Object.entries(c.notes)) {
    if (!allKeys.has(key)) {
      errors.push(`locales/notes/ 里有 ${key} 的备注，但文案里没有这个键。删掉这条备注。`);
      continue;
    }
    const names = new Set<string>();
    try {
      for (const name of paramTypesOf(source[key] ?? "").keys()) names.add(name);
    } catch {
      // 上面已报
    }
    for (const name of Object.keys(note.params)) {
      if (!names.has(name))
        errors.push(
          `locales/notes/ 里 ${key} 的备注 ${name} 对应的参数在文案里不存在。删掉它或改正参数名。`,
        );
    }
    if (note.max !== undefined) {
      for (const [locale, texts] of Object.entries(c.texts)) {
        const message = texts[key];
        if (message === undefined) continue;
        const longest = Math.max(...flatVariants(message).map((v) => [...literalOnly(v)].length));
        if (longest > note.max) {
          errors.push(
            `${c.files[locale]?.[key] ?? key} 的 ${key} 写死的文字有 ${longest} 个字符，超过备注里的上限 ${note.max}（参数不计）。缩短它，或在备注里调整 max。`,
          );
        }
      }
    }
  }
  return errors;
}

export function checkReferences(
  c: LoadedCatalogs,
  found: ReturnType<typeof scanRepoReferences>,
): string[] {
  const errors: string[] = [];
  const source = c.texts[sourceLocale] ?? {};
  for (const ref of found.refs) {
    if (!(ref.key in source)) {
      errors.push(
        `${ref.file}:${ref.line} 引用了不存在的键 ${ref.key}。键拼错了就改正；是新文案就先在 locales/${sourceLocale}/ 和 locales/${fallbackLocale}/ 里添加（${fix}）。`,
      );
    }
  }
  for (const ref of found.dynamic) {
    if (!isFamilyHead(ref.head)) {
      errors.push(
        `${ref.file}:${ref.line} 用拼出来的键（以 "${ref.head}" 开头）。只有 errors.、notice.、runState. 这三个由登记表推出的键族可以拼；其余的键写成完整的字符串字面量。`,
      );
    }
  }
  return errors;
}

export const i18nKeys: Check = {
  name: "i18n-keys",
  run(root) {
    const catalogs = readCatalogs(root);
    return [...checkCatalogs(catalogs), ...checkReferences(catalogs, scanRepoReferences(root))];
  },
};
