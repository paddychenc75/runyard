import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "./locale.ts";

// 对 intl-messageformat 的薄封装：换库只动这一个文件（技术设计 §6.8、风险表）。

export type TagFormatter = (chunks: string[]) => string;
export type MessageValue = string | number | boolean | Date | TagFormatter;
export type MessageValues = Readonly<Record<string, MessageValue>>;

const cache = new Map<string, IntlMessageFormat>();

export function formatMessage(locale: Locale, message: string, values: MessageValues): string {
  const cacheKey = `${locale}\u0000${message}`;
  let compiled = cache.get(cacheKey);
  if (compiled === undefined) {
    compiled = new IntlMessageFormat(message, locale);
    cache.set(cacheKey, compiled);
  }
  const result = compiled.format<string>(values as Record<string, MessageValue>);
  // 带标签的文案会得到数组；命令行只要字符串，标签函数返回字符串，所以拼起来
  return Array.isArray(result) ? result.join("") : String(result);
}
