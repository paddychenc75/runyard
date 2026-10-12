import { IntlMessageFormat } from "intl-messageformat";
import type { Locale } from "./locale.ts";

// 对 intl-messageformat 的薄封装：换库只动这一个文件（技术设计 §6.8、风险表）。

export type TagFormatter = (chunks: string[]) => string;
export type MessageValue = string | number | boolean | Date | TagFormatter;
export type MessageValues = Readonly<Record<string, MessageValue>>;

// 可选参数的约定：登记表里 `exitCode?: number` 这类参数，ICU 缺值会抛错，
// 所以文案写成 `{exitCode, select, none {} other {…{exitCode}…}}`。
// select 有 none 分支、而调用的人没传这个参数时，这里替他传 "none"。
// 只认“带 none 分支的 select”：普通的必填参数漏传照样抛错，不会被悄悄吞掉。
export const NONE_VALUE = "none";

interface Compiled {
  format: IntlMessageFormat;
  optional: readonly string[];
}

// 只用 AST 的形状：select 有 options 而没有 pluralType（plural 才有），不依赖解析器的枚举数值
interface AstNode {
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  pluralType?: string;
  children?: AstNode[];
}

function optionalNames(elements: readonly AstNode[], out: Set<string>): void {
  for (const element of elements) {
    if (element.options !== undefined && element.pluralType === undefined) {
      if (NONE_VALUE in element.options && element.value !== undefined) out.add(element.value);
    }
    for (const option of Object.values(element.options ?? {})) optionalNames(option.value, out);
    optionalNames(element.children ?? [], out);
  }
}

const cache = new Map<string, Compiled>();

export function formatMessage(locale: Locale, message: string, values: MessageValues): string {
  const cacheKey = `${locale}\u0000${message}`;
  let compiled = cache.get(cacheKey);
  if (compiled === undefined) {
    const format = new IntlMessageFormat(message, locale);
    const names = new Set<string>();
    optionalNames(format.getAst() as unknown as AstNode[], names);
    compiled = { format, optional: [...names] };
    cache.set(cacheKey, compiled);
  }
  let filled = values;
  for (const name of compiled.optional) {
    if (values[name] === undefined) filled = { ...filled, [name]: NONE_VALUE };
  }
  const result = compiled.format.format<string>(filled as Record<string, MessageValue>);
  // 带标签的文案会得到数组；命令行只要字符串，标签函数返回字符串，所以拼起来
  return Array.isArray(result) ? result.join("") : String(result);
}
