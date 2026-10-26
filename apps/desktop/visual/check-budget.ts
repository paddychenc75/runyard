import { join } from "node:path";
import { checkBudget, listBaselines } from "../../../packages/ui/visual/budget.ts";

// 与组件基准合计使用既有30MB预算，每张仍不超过200KB，不另开放宽额度。
const files = [
  ...listBaselines(join(import.meta.dirname, "__screenshots__")),
  ...listBaselines(join(import.meta.dirname, "../../../packages/ui/visual/__screenshots__")),
];
const errors = checkBudget(files);
for (const error of errors) console.error(error);
if (errors.length) process.exitCode = 1;
