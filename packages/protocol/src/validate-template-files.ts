import type { LintIssue } from "./lint-issue.ts";
import type { Template } from "./template-file.ts";
import { escapesFilesFolder } from "./validate-template.ts";

// 需要看 files/ 里有什么的两条规则（规格 TEMPLATES-FORMAT-08、09）。
// 文件夹怎么读是调用方的事，这里只要一个“有没有、内容是什么”的接口，所以是纯函数、可以用内存数据测。

export interface TemplateFiles {
  // 路径相对 files/，用 / 分隔
  has(path: string): boolean;
  // 文本内容；不存在或读不出文本时为 undefined
  text(path: string): string | undefined;
}

// {{x}} 是字面占位：花括号里只有变量名，没有空格、表达式、条件（规格 templates/format 第一条）
const placeholder = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(placeholder)].map((match) => match[1] as string))];
}

export function checkTemplateFiles(template: Template, files: TemplateFiles): LintIssue[] {
  const issues: LintIssue[] = [];
  if (!escapesFilesFolder(template.entry) && !files.has(template.entry))
    issues.push({
      rule: "entry-missing",
      path: "entry",
      message: `entry "${template.entry}" is not in files/`,
    });
  const declared = new Set(Object.keys(template.variables ?? {}));
  // 项目名由创建时自动提供
  declared.add("name");
  (template.substitute ?? []).forEach((file, index) => {
    if (escapesFilesFolder(file)) return;
    const path = `substitute.${index}`;
    if (!files.has(file)) {
      issues.push({
        rule: "template-json-invalid",
        path,
        message: `substitute file "${file}" is not in files/`,
      });
      return;
    }
    for (const variable of findPlaceholders(files.text(file) ?? ""))
      if (!declared.has(variable))
        issues.push({
          rule: "variable-undeclared",
          path,
          message: `"${file}" uses {{${variable}}} but variables does not declare "${variable}"`,
        });
  });
  return issues;
}
