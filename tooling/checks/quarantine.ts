import { join } from "node:path";
import { loadQuarantine, today, validateEntries } from "../vitest/quarantine.ts";
import type { Check } from "./workspace.ts";

// quarantine：偶发失败测试的隔离名单（tooling/vitest/quarantine.json）只许临时存在。
// 每一项要有原因、issue 编号和到期日；过了到期日这条检查失败，逼着有人修好测试或重新评审延期（docs/guides/testing.md）。
export const quarantine: Check = {
  name: "quarantine",
  run(root) {
    try {
      return validateEntries(loadQuarantine(join(root, "tooling/vitest/quarantine.json")), today());
    } catch {
      return [
        "tooling/vitest/quarantine.json 读不出来：它必须是一个 JSON 数组（没有隔离项就写 [])。",
      ];
    }
  },
};
