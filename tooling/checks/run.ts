import { join } from "node:path";
import { adrIndex } from "./adr-index.ts";
import { agentsConfig } from "./agents-config.ts";
import { depsPolicy } from "./deps-policy.ts";
import { depsRecord } from "./deps-record.ts";
import { docsCommands } from "./docs-commands.ts";
import { docsLinks } from "./docs-links.ts";
import { docsPaths } from "./docs-paths.ts";
import { docsSize } from "./docs-size.ts";
import { docsStructure } from "./docs-structure.ts";
import { fileSize } from "./file-size.ts";
import { generatedFresh } from "./generated-fresh.ts";
import { i18nCodes } from "./i18n-codes.ts";
import { i18nGlossary } from "./i18n-glossary.ts";
import { i18nKeys } from "./i18n-keys.ts";
import { i18nUnused } from "./i18n-unused.ts";
import { i18nWording } from "./i18n-wording.ts";
import { icons } from "./icons.ts";
import { layers } from "./layers.ts";
import { noClaudeMd } from "./no-claude-md.ts";
import { noPermanentDelete } from "./no-permanent-delete.ts";
import { platformBranching } from "./platform-branching.ts";
import { platformContract } from "./platform-contract.ts";
import { prdAnchorsKept } from "./prd-anchors-kept.ts";
import { prdRefs } from "./prd-refs.ts";
import { quarantine } from "./quarantine.ts";
import { readmeSync } from "./readme-sync.ts";
import { skips } from "./skips.ts";
import { specTrace } from "./spec-trace.ts";
import { specValidate } from "./spec-validate.ts";
import { styleTokens } from "./style-tokens.ts";
import { templateData } from "./template-data.ts";
import { terms } from "./terms.ts";
import { testPhases } from "./test-phases.ts";
import { testingImports } from "./testing-imports.ts";
import { uiFixtures } from "./ui-fixtures.ts";
import { uiLayers } from "./ui-layers.ts";
import { uiPurity } from "./ui-purity.ts";
import { uiStrings } from "./ui-strings.ts";
import type { Check } from "./workspace.ts";

// pnpm check 的入口：依次运行全部仓库检查，任何一项失败就以非 0 退出。
// 技术设计 §9.4 在第 3 次提交时列了十八项；platform-contract 与 platform-branching 随平台包（#24）加入。
// 国际化的六项（i18n-keys、i18n-codes、i18n-glossary、i18n-wording、i18n-unused、ui-strings）随 M1 的 #23 加入；
// no-permanent-delete（永久删除调用）随 M1 的 #28 加入。
// 组件化的六项（ui-layers、ui-purity、style-tokens、ui-fixtures、icons、file-size）随 M2 的 #165 加入；
// ui-layers 同时接管 M1 暂放在 ui-strings 里的 process.stdout.write 检查。site-i18n 随 M4。spec-validate、spec-trace 随第 5 次提交。
const checks: Check[] = [
  layers,
  depsPolicy,
  depsRecord,
  noClaudeMd,
  agentsConfig,
  docsLinks,
  docsPaths,
  docsCommands,
  docsSize,
  docsStructure,
  generatedFresh,
  prdRefs,
  prdAnchorsKept,
  terms,
  readmeSync,
  adrIndex,
  skips,
  quarantine,
  testPhases,
  platformContract,
  platformBranching,
  testingImports,
  i18nKeys,
  i18nCodes,
  i18nGlossary,
  i18nWording,
  i18nUnused,
  uiStrings,
  uiLayers,
  uiPurity,
  styleTokens,
  uiFixtures,
  icons,
  fileSize,
  noPermanentDelete,
  templateData,
  specValidate,
  specTrace,
];

const root = join(import.meta.dirname, "..", "..");
let failed = false;
for (const check of checks) {
  const errors = check.run(root);
  if (errors.length === 0) {
    console.log(`通过  ${check.name}`);
    continue;
  }
  failed = true;
  console.error(`失败  ${check.name}`);
  for (const error of errors) console.error(`  - ${error}`);
}
process.exit(failed ? 1 : 0);
