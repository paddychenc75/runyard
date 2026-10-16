import { checkTemplateData } from "../scripts/template-data.ts";
import type { Check } from "./workspace.ts";

// template-data：templates/ 里的工具定义、运行器、内置模板都合格（规格 templates/format；技术设计 §8.3）。
export const templateData: Check = {
  name: "template-data",
  run(root) {
    const report = checkTemplateData(root);
    const errors = [...report.problems];
    for (const result of report.results)
      for (const issue of result.errors)
        errors.push(
          `模板 ${result.template} 的 ${issue.path || "template.json"}：${issue.rule}，${issue.message}。改到 pnpm template:lint 不再报错；规则见 openspec/specs/templates/format/spec.md。`,
        );
    return errors;
  },
};
