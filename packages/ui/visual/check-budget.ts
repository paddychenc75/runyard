import { join } from "node:path";
import { checkBudget, listBaselines } from "./budget.ts";

// 命令行入口：node packages/ui/visual/check-budget.ts。ui-baseline 在提交基准图之前、ui-visual 在比对之前都跑它。
const errors = checkBudget(listBaselines(join(import.meta.dirname, "__screenshots__")));
for (const error of errors) process.stderr.write(`${error}\n`);
process.exit(errors.length === 0 ? 0 : 1);
