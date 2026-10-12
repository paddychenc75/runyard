// 模板 requires 和工具定义里的版本范围（规格 TEMPLATES-FORMAT-28 至 30）：
// 用空格分隔的比较式，比较符只有 >=、>、<=、<，版本是 1 到 3 段数字（如 22、22.18、1.26.0）。
// 必须有下限；缺上限只是警告。^、~、latest、x 范围、逗号分隔一律无效。
// 这里只管写法；某个版本是否落在范围内是工具链检测的事。

export type RangeOperator = ">=" | ">" | "<=" | "<";

export interface RangeComparator {
  operator: RangeOperator;
  version: string;
}

export type ParsedRange =
  | { ok: true; comparators: RangeComparator[]; hasLower: true; hasUpper: boolean }
  | { ok: false; reason: "syntax" | "no-lower" };

const comparatorPattern = /^(>=|<=|>|<)(\d+(?:\.\d+){0,2})$/;

export function parseVersionRange(text: string): ParsedRange {
  const tokens = text.trim().split(/\s+/);
  const comparators: RangeComparator[] = [];
  for (const token of tokens) {
    const match = comparatorPattern.exec(token);
    if (match === null) return { ok: false, reason: "syntax" };
    comparators.push({ operator: match[1] as RangeOperator, version: match[2] as string });
  }
  const hasLower = comparators.some((c) => c.operator === ">=" || c.operator === ">");
  if (!hasLower) return { ok: false, reason: "no-lower" };
  const hasUpper = comparators.some((c) => c.operator === "<" || c.operator === "<=");
  return { ok: true, comparators, hasLower: true, hasUpper };
}
