import { type CodeRegistries, codeEntries } from "../../packages/i18n/build/code-families.ts";
import { argUses } from "../../packages/i18n/build/icu-structure.ts";
import { protocolRegistries, readCatalogs, sourceLocale } from "./i18n-catalogs.ts";
import { scanRepoReferences } from "./i18n-references.ts";
import type { Check } from "./workspace.ts";

// i18n-unused：文案里有、却没有被用到的键。“用到”的定义（i18n-references.ts 顶部）：
// 静态 t("键") 引用；协议登记表推出的键（只有这一个来源，不存在按前缀豁免）；
// 被别的文案以 {term_<名>} 引用的 platform.<名>。
// 登记表里没有的 errors.* 之类的键因此照样算未使用。
// 另一条（功能模块用了别的模块的文案组）要等界面的功能目录出现，随 M2。

export function checkUnused(
  root: string,
  registries: CodeRegistries = protocolRegistries,
): string[] {
  const catalogs = readCatalogs(root);
  const used = new Set<string>(codeEntries(registries).map((entry) => entry.key));
  for (const ref of scanRepoReferences(root).refs) used.add(ref.key);
  for (const texts of Object.values(catalogs.texts)) {
    for (const message of Object.values(texts)) {
      try {
        for (const use of argUses(message)) {
          if (use.name.startsWith("term_")) used.add(`platform.${use.name.slice("term_".length)}`);
        }
      } catch {
        // 不是合法 ICU 由 i18n-keys 报
      }
    }
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [locale, texts] of Object.entries(catalogs.texts)) {
    for (const key of Object.keys(texts)) {
      if (used.has(key) || seen.has(key)) continue;
      seen.add(key);
      errors.push(
        `${catalogs.files[locale]?.[key] ?? key} 的 ${key} 没有被用到（代码里没有 t('${key}')，也不是登记表推出的键）。` +
          `删掉它在 ${sourceLocale}、en 两份文案和备注里的条目；如果是新功能的文案，把用到它的代码一起提交。`,
      );
    }
  }
  return errors;
}

export const i18nUnused: Check = { name: "i18n-unused", run: (root) => checkUnused(root) };
