// 项目名称的纯逻辑：校验和默认名称（规格 DESKTOP-CREATE-FLOW-06、09、10；runyard://new 链接也用，DESKTOP-LINKS-06、11）。
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
