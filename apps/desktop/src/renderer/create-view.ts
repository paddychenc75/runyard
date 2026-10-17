// 新建弹窗的纯逻辑：默认名称和名称校验（规格 DESKTOP-CREATE-FLOW-06、09、10）。
// 校验规则和命令行、管理进程一致（PRD #prd-naming）：小写字母、数字、连字符，最长 64 个字符，
// 首尾不是连字符。界面先判一遍是为了立刻在名称下显示错误；管理进程仍会再判，两边不一致时以它为准。

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export type NameProblem = "invalid" | "taken";

export function nameProblem(name: string, existing: readonly string[]): NameProblem | null {
  if (!NAME_PATTERN.test(name)) return "invalid";
  return existing.includes(name) ? "taken" : null;
}

/** “模板标识加序号”：序号取现有同名前缀项目里最大的加一，不回头补空缺（PRD #prd-naming） */
export function defaultName(templateId: string, existing: readonly string[]): string {
  const prefix = `${templateId}-`;
  let max = 0;
  for (const name of existing) {
    if (!name.startsWith(prefix)) continue;
    const rest = name.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${max + 1}`;
}

/** 自定义天数：大于 0 的整数；其他（空、小数、负数、字母）都不算 */
export function parseCustomDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days > 0 && Number.isSafeInteger(days) ? days : null;
}

/** 自动清理的天数选项（规格 DESKTOP-CREATE-FLOW-08）；“自定义”另行处理 */
export const PRESET_DAYS = [7, 30, 90] as const;
export const DEFAULT_DAYS = 30;
