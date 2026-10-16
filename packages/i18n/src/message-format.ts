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

function compile(locale: Locale, message: string): Compiled {
  const cacheKey = `${locale}\u0000${message}`;
  let compiled = cache.get(cacheKey);
  if (compiled === undefined) {
    const format = new IntlMessageFormat(message, locale);
    const names = new Set<string>();
    optionalNames(format.getAst() as unknown as AstNode[], names);
    compiled = { format, optional: [...names] };
    cache.set(cacheKey, compiled);
  }
  return compiled;
}

function fillOptional(compiled: Compiled, values: MessageValues): MessageValues {
  let filled = values;
  for (const name of compiled.optional) {
    if (values[name] === undefined) filled = { ...filled, [name]: NONE_VALUE };
  }
  return filled;
}

export function formatMessage(locale: Locale, message: string, values: MessageValues): string {
  const compiled = compile(locale, message);
  const result = compiled.format.format<string>(
    fillOptional(compiled, values) as Record<string, MessageValue>,
  );
  // 带标签的文案会得到数组；命令行只要字符串，标签函数返回字符串，所以拼起来
  return Array.isArray(result) ? result.join("") : String(result);
}

// 富文本标签的函数：收到标签里的内容，返回一个结果（界面绑定里是 React 节点）
export type RichTagFormatter<R> = (chunks: (string | R)[]) => R | string;
export type RichTags<R> = Readonly<Record<string, RichTagFormatter<R>>>;

// 给界面绑定用：标签由调用方变成节点，结果是“文字和节点”交替的数组，不拼成字符串
export function formatMessageParts<R>(
  locale: Locale,
  message: string,
  values: MessageValues,
  tags: RichTags<R>,
): (string | R)[] {
  const compiled = compile(locale, message);
  const result = compiled.format.format<string | R>({
    ...fillOptional(compiled, values),
    ...tags,
  } as never);
  return Array.isArray(result) ? result : [result as string | R];
}
