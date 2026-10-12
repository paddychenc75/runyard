import type { CodeRegistries } from "../../packages/i18n/build/code-families.ts";
import { checkCodeTexts } from "../../packages/i18n/build/code-texts-check.ts";
import { protocolRegistries, readCatalogs } from "./i18n-catalogs.ts";
import type { Check } from "./workspace.ts";

// i18n-codes：protocol 登记的错误码、提示码、运行状态在每种语言里都有文案，参数和登记表一致，
// errors.* 等键族下没有不存在的代码。实现在 packages/i18n/build/code-texts-check.ts，
// 包内测试（build/code-texts-check.test.ts）跑的是同一份函数；这里负责在整个仓库层面让它失败。
// 两种语言之间的参数一致由 i18n-keys 对全部键统一检查（含这三族），这里不重复。

export function checkCodes(
  root: string,
  registries: CodeRegistries = protocolRegistries,
): string[] {
  const catalogs = readCatalogs(root);
  return [
    ...catalogs.problems,
    ...checkCodeTexts(catalogs.texts, registries).map((problem) => `${problem.message}`),
  ];
}

export const i18nCodes: Check = { name: "i18n-codes", run: (root) => checkCodes(root) };
