import {
  checkTemplateFiles,
  isRecord,
  type LintIssue,
  type LintResult,
  type Template,
  validateRunner,
  validateTemplate,
} from "@runyard/protocol";
import { nodeTemplateIssues } from "./lint-node-template.ts";

// `template lint` 的判定（规格 templates/format 的“template lint 的判定”；技术设计 §8.3）。
// 纯函数：模板文件夹、运行器、工具定义都由调用方读好交进来，所以仓库脚本、以后的命令行和测试用同一份逻辑。
// 一次报全，不在第一个问题处停（TEMPLATES-FORMAT-38）；格式比程序新的文件只报那一条（-11）。

/** 一个模板文件夹：template.json 的原文，加 files/ 里的内容（路径相对 files/，用 / 分隔） */
export interface TemplateFolder {
  readonly templateJson: string;
  has(path: string): boolean;
  /** 文本内容；不存在或读不出文本时为 undefined */
  text(path: string): string | undefined;
}

export interface LintTemplateInput {
  readonly folder: TemplateFolder;
  /** 内置模板必须有维护者（TEMPLATES-FORMAT-10） */
  readonly builtin: boolean;
  /** 运行器标识到 runner.json 的解析结果（原始 JSON，由本函数校验） */
  readonly runners: ReadonlyMap<string, unknown>;
  /** 应用内置的工具定义里有的工具标识 */
  readonly knownTools: ReadonlySet<string>;
  /** template.json 读不出标识时，结果里 template 字段用它（通常是文件夹名） */
  readonly fallbackName: string;
}

// 运行器的问题和模板的问题放在同一份结果里，路径加 runner. 前缀区分
const RUNNER_PREFIX = "runner.";

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function runnerIssues(raw: Record<string, unknown>, runners: ReadonlyMap<string, unknown>) {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const id = raw.runner;
  if (typeof id !== "string") return { errors, warnings };
  if (!runners.has(id)) {
    errors.push({ rule: "runner-not-found", path: "runner", message: `no runner "${id}"` });
    return { errors, warnings };
  }
  const result = validateRunner(runners.get(id));
  const prefixed = (issue: LintIssue): LintIssue => ({
    ...issue,
    path: issue.path === "" ? "runner" : `${RUNNER_PREFIX}${issue.path}`,
  });
  return { errors: result.errors.map(prefixed), warnings: result.warnings.map(prefixed) };
}

// 文件夹检查只用到 entry、variables、substitute；模板别处有错时也照样查这三项，才能一次报全
function lenientTemplate(raw: Record<string, unknown>): Template {
  const strings = (value: unknown): string[] | undefined =>
    Array.isArray(value) && value.every((item) => typeof item === "string")
      ? (value as string[])
      : undefined;
  return {
    entry: typeof raw.entry === "string" ? raw.entry : "",
    variables: isRecord(raw.variables) ? (raw.variables as Record<string, string>) : undefined,
    substitute: strings(raw.substitute),
  } as Template;
}

export function lintTemplate(input: LintTemplateInput): LintResult {
  const parsed = parseJson(input.folder.templateJson);
  if (!parsed.ok || !isRecord(parsed.value)) {
    return {
      template: input.fallbackName,
      ok: false,
      errors: [
        {
          rule: "template-json-invalid",
          path: "",
          message: "template.json is not a JSON object",
        },
      ],
      warnings: [],
    };
  }
  const raw = parsed.value;
  const name = typeof raw.id === "string" ? raw.id : input.fallbackName;
  const checked = validateTemplate(raw, { builtin: input.builtin, knownTools: input.knownTools });
  if (checked.errors.some((issue) => issue.rule === "format-version-unsupported"))
    return { template: name, ok: false, errors: checked.errors, warnings: checked.warnings };

  const runner = runnerIssues(raw, input.runners);
  const errors = [
    ...checked.errors,
    ...runner.errors,
    ...(raw.entry === undefined && raw.substitute === undefined
      ? []
      : checkTemplateFiles(lenientTemplate(raw), input.folder)),
    ...nodeTemplateIssues(input.folder),
  ];
  return {
    template: name,
    ok: errors.length === 0,
    errors,
    warnings: [...checked.warnings, ...runner.warnings],
  };
}
