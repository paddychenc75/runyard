import type { Combination } from "./matrix.ts";

// “界面变更对照页”给负责人看，标题用中文（技术设计 §6.7“你怎么审图”）。
// 这是开发工具的文字，不是应用界面，所以不走文案包；产品源码的汉字检查只查 src/ 下的文件。
const themeLabels = { light: "浅色", dark: "深色" } as const;
const localeLabels = { "zh-CN": "中文", en: "英文", "en-XA": "伪语言" } as const;

export function combinationLabel(combination: Combination): string {
  return `${themeLabels[combination.theme]}、${localeLabels[combination.locale as keyof typeof localeLabels]}`;
}
