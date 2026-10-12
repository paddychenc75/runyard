import {
  isRecord,
  type LintIssue,
  mergeIssues,
  newerFormatIssue,
  structuralIssues,
  type Validation,
} from "./lint-issue.ts";
import { TEMPLATE_FORMAT_VERSION, type Template, templateSchema } from "./template-file.ts";
import { parseVersionRange } from "./version-range.ts";

// 校验一份 template.json 的内容（规格 templates/format 的字段与校验、运行环境两条）。
// 纯函数：不读文件，不联网。需要文件夹内容的规则在 validate-template-files.ts。
// `template lint` 把这里的结果和运行器、文件夹的检查合在一起。

export interface TemplateValidationOptions {
  // 内置模板必须有维护者（规格 TEMPLATES-FORMAT-10）；用户模板不查这一条
  builtin?: boolean;
  // 应用内置的工具定义里有的工具标识。不给就不检查 tool-unknown
  knownTools?: ReadonlySet<string>;
}

// 绝对路径、盘符、含 .. 段：会逃出 files/（规格 TEMPLATES-FORMAT-04）
export function escapesFilesFolder(path: string): boolean {
  return (
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.split(/[\\/]/).some((part) => part === "..")
  );
}

function pathEscapeIssues(raw: Record<string, unknown>): LintIssue[] {
  const issues: LintIssue[] = [];
  const check = (path: string, value: unknown) => {
    if (typeof value === "string" && escapesFilesFolder(value))
      issues.push({
        rule: "path-escape",
        path,
        message: `"${value}" points outside files/`,
      });
  };
  check("entry", raw.entry);
  if (Array.isArray(raw.substitute))
    for (const [index, value] of raw.substitute.entries()) check(`substitute.${index}`, value);
  return issues;
}

function nameIssues(raw: Record<string, unknown>): LintIssue[] {
  const name = raw.name;
  if (isRecord(name) && typeof name.en !== "string")
    return [{ rule: "name-missing-en", path: "name", message: "name must have an en entry" }];
  return [];
}

function requiresIssues(
  raw: Record<string, unknown>,
  knownTools: ReadonlySet<string> | undefined,
): LintIssue[] {
  if (raw.requires === undefined)
    return [
      {
        rule: "requires-missing",
        path: "requires",
        message: "requires is required; write {} for a template that needs no tools",
      },
    ];
  if (!isRecord(raw.requires)) return [];
  const known = (tool: unknown) =>
    knownTools === undefined || (typeof tool === "string" && knownTools.has(tool));
  const issues: LintIssue[] = [];
  for (const [tool, item] of Object.entries(raw.requires)) {
    if (!isRecord(item)) continue;
    const base = `requires.${tool}`;
    if (!known(tool) && item.install === undefined)
      issues.push({
        rule: "tool-unknown",
        path: base,
        message: `no tool definition for "${tool}" and no install given`,
      });
    if (item.fallback !== undefined && !known(item.fallback))
      issues.push({
        rule: "tool-unknown",
        path: `${base}.fallback`,
        message: `fallback "${String(item.fallback)}" has no tool definition`,
      });
    if (typeof item.version === "string")
      issues.push(...rangeIssues(`${base}.version`, item.version));
  }
  return issues;
}

function rangeIssues(path: string, text: string): LintIssue[] {
  const range = parseVersionRange(text);
  if (!range.ok)
    return [
      {
        rule: "range-invalid",
        path,
        message:
          range.reason === "no-lower"
            ? `"${text}" has no lower bound; write for example ">=22.18 <27"`
            : `"${text}" is not a list of space-separated comparisons; write for example ">=22.18 <27"`,
      },
    ];
  if (!range.hasUpper)
    return [
      {
        rule: "range-no-upper",
        path,
        message: `"${text}" has no upper bound; add the highest major version you tested`,
      },
    ];
  return [];
}

function maintainerIssues(raw: Record<string, unknown>, builtin: boolean | undefined) {
  if (builtin !== true || raw.maintainer !== undefined) return [];
  return [
    {
      rule: "maintainer-missing" as const,
      path: "maintainer",
      message: "built-in templates need a named maintainer",
    },
  ];
}

export function validateTemplate(
  raw: unknown,
  options: TemplateValidationOptions = {},
): Validation<Template> {
  const newer = newerFormatIssue(raw, TEMPLATE_FORMAT_VERSION);
  if (newer !== undefined) return { errors: [newer], warnings: [] };
  const parsed = templateSchema.safeParse(raw);
  const structural = parsed.success ? [] : structuralIssues(parsed.error, "template-json-invalid");
  const specific = isRecord(raw)
    ? [
        ...nameIssues(raw),
        ...pathEscapeIssues(raw),
        ...requiresIssues(raw, options.knownTools),
        ...maintainerIssues(raw, options.builtin),
      ]
    : [];
  const { errors, warnings } = mergeIssues(specific, structural);
  return parsed.success && errors.length === 0
    ? { value: parsed.data, errors, warnings }
    : { errors, warnings };
}
