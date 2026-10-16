import type { Translator } from "./create-translator.ts";
import type { Locale } from "./locale.ts";
import { markLocalized } from "./localized.ts";
import type { MessageMap, Messages } from "./messages.ts";

// 测试替身：返回“键加参数”而不是句子，让测试断言键（技术设计 §6.8 规则 8）。
// 输出形如 `⟦library.summary|count=3,running=1⟧`，参数按名字排序，所以结果稳定。
export function createTestTranslator<P extends MessageMap = Messages>(
  locale: Locale = "en",
): Translator<P> {
  const render = (key: string, values?: Record<string, unknown>) => {
    // 标签函数（富文本）不是参数值，不写进“键加参数”
    const pairs = Object.entries(values ?? {})
      .filter(([, value]) => typeof value !== "function")
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([name, value]) => `${name}=${String(value)}`);
    return `⟦${[key, ...(pairs.length === 0 ? [] : [pairs.join(",")])].join("|")}⟧`;
  };
  const t = ((key: string, values?: Record<string, unknown>) =>
    markLocalized(render(key, values))) as Translator<P>["t"];
  const rich: Translator<P>["rich"] = (key, values) => [render(key, values)];
  return { locale, t, rich };
}
