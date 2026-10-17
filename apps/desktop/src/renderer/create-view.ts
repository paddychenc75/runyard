// 新建弹窗的纯逻辑：默认名称和名称校验（规格 DESKTOP-CREATE-FLOW-06、09、10；规则在 shared/project-name.ts，链接也用）。
export { defaultName, type NameProblem, nameProblem } from "../shared/project-name.ts";

/** 自定义天数：大于 0 的整数；其他（空、小数、负数、字母）都不算 */
export function parseCustomDays(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days > 0 && Number.isSafeInteger(days) ? days : null;
}

/** 自动清理的天数选项（规格 DESKTOP-CREATE-FLOW-08）；“自定义”另行处理 */
export const PRESET_DAYS = [7, 30, 90] as const;
export const DEFAULT_DAYS = 30;
