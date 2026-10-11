import { join } from "node:path";
import { depsPolicy } from "./deps-policy.ts";
import { depsRecord } from "./deps-record.ts";
import { layers } from "./layers.ts";
import type { Check } from "./workspace.ts";

// pnpm check 的入口：依次运行全部仓库检查，任何一项失败就以非 0 退出。
// 其余检查（docs-*、terms、prd-refs 等）随后面的提交加入，见技术设计 §9.4。
const checks: Check[] = [layers, depsPolicy, depsRecord];

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
