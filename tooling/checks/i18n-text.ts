import { flatVariants, literalOnly } from "../../packages/i18n/build/icu-structure.ts";

// 国际化检查共用：一条文案里“写死的文字”（去掉参数，保留每个分支）。
export function literalTexts(message: string): string[] {
  try {
    return flatVariants(message).map(literalOnly);
  } catch {
    return []; // 不是合法 ICU 由 i18n-keys 报
  }
}
