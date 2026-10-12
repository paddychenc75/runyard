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
import { generatedFresh } from "./generated-fresh.ts";
import { layers } from "./layers.ts";
import { noClaudeMd } from "./no-claude-md.ts";
import { platformBranching } from "./platform-branching.ts";
import { platformContract } from "./platform-contract.ts";
import { prdAnchorsKept } from "./prd-anchors-kept.ts";
import { prdRefs } from "./prd-refs.ts";
import { readmeSync } from "./readme-sync.ts";
import { skips } from "./skips.ts";
import { terms } from "./terms.ts";
import type { Check } from "./workspace.ts";

// pnpm check 的入口：依次运行全部仓库检查，任何一项失败就以非 0 退出。
// 技术设计 §9.4 在第 3 次提交时列了十八项；platform-contract 与 platform-branching 随平台包（#24）加入。
// 还没有的一项要等检查对象出现：i18n-keys（M1 的文案包）。
// spec-validate、spec-trace 随第 5 次提交；界面和国际化的十二项随 M1、M2、M4。
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
  platformContract,
  platformBranching,
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
