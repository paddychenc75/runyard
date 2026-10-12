import { z } from "zod";

// 格式校验和 `template lint` 共用的“一条问题”（规格 templates/format 的 lint 判定）。
// 规则标识是稳定的字符串；message 是给开发者看的英文，不翻译，也不是用户文案。

export const lintRules = [
  "template-json-invalid",
  "runner-invalid",
  "name-missing-en",
  "format-version-unsupported",
  "path-escape",
  "variable-undeclared",
  "entry-missing",
  "maintainer-missing",
  "command-shell-syntax",
  "stop-signal-name",
  "bind-address",
  "port-hardcoded",
  "requires-missing",
  "range-invalid",
  "range-no-upper",
  "tool-unknown",
  "runner-not-found",
  "template-id-reserved",
  "allow-builds-missing",
  "lockfile-missing",
  "version-not-exact",
] as const;
export const lintRuleSchema = z.enum(lintRules);
export type LintRule = z.infer<typeof lintRuleSchema>;

// 缺上限的范围只给警告，其余规则都是错误（规格 TEMPLATES-FORMAT-29）
export const warningRules: readonly LintRule[] = ["range-no-upper"];

export const lintIssueSchema = z.object({
  rule: lintRuleSchema,
  path: z.string().describe("问题所在字段的路径，层级用 . 连接，数组下标是数字；整个文件为空串"),
  message: z.string().describe("英文，给开发者看"),
});
export type LintIssue = z.infer<typeof lintIssueSchema>;

// `template lint --json` 的结果；有任何 errors 时 ok 为 false（规格 TEMPLATES-FORMAT-37、38）
export const lintResultSchema = z.object({
  template: z.string(),
  ok: z.boolean(),
  errors: z.array(lintIssueSchema),
  warnings: z.array(lintIssueSchema),
});
export type LintResult = z.infer<typeof lintResultSchema>;

// 校验一个文件的结果。value 只在没有任何 errors 时才有（已套用默认值）
export interface Validation<T> {
  value?: T;
  errors: LintIssue[];
  warnings: LintIssue[];
}

export function pathText(path: readonly PropertyKey[]): string {
  return path.map(String).join(".");
}

function isUnder(path: string, claimed: string): boolean {
  return path === claimed || path.startsWith(`${claimed}.`);
}

// 把具体规则的发现和 zod 的结构问题合成一份：具体规则占住的路径，zod 在那里的问题不再重复报；
// 同一规则同一路径只留一条。具体规则各自在原始数据上检查，不依赖 zod 是否通过，所以一次能报全。
export function mergeIssues(
  specific: readonly LintIssue[],
  structural: readonly LintIssue[],
): { errors: LintIssue[]; warnings: LintIssue[] } {
  const claimed = specific.map((issue) => issue.path);
  const kept = structural.filter(
    (issue) => !claimed.some((path) => path !== "" && isUnder(issue.path, path)),
  );
  const seen = new Set<string>();
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  for (const issue of [...specific, ...kept]) {
    const key = `${issue.rule}\0${issue.path}\0${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (warningRules.includes(issue.rule) ? warnings : errors).push(issue);
  }
  return { errors, warnings };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// 读到比程序认识的更新的格式版本：整个文件不再检查，只报这一条（规格 TEMPLATES-FORMAT-11）
export function newerFormatIssue(raw: unknown, supported: number): LintIssue | undefined {
  if (!isRecord(raw)) return undefined;
  const found = raw.formatVersion;
  if (typeof found !== "number" || !Number.isInteger(found) || found <= supported) return undefined;
  return {
    rule: "format-version-unsupported",
    path: "formatVersion",
    message: `formatVersion ${found} is newer than the supported version ${supported}`,
  };
}

export function structuralIssues(
  error: z.ZodError,
  rule: "template-json-invalid" | "runner-invalid",
): LintIssue[] {
  return error.issues.map((issue) => ({
    rule,
    path: pathText(issue.path),
    message: issue.message,
  }));
}
