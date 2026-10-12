import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { isAutoParam } from "./icu-params.ts";

// 一条 ICU 文案的结构信息：谁用了哪个参数、复数有哪些类别、展开成一行字后长什么样。
// 供仓库检查（i18n-keys、i18n-codes、i18n-wording）用；它们只读结构，不渲染文案。

export type ArgKind = "argument" | "number" | "date" | "time" | "select" | "plural" | "tag";

export interface ArgUse {
  name: string;
  kind: ArgKind;
  /** select、plural 的分支名（含 other、=0 这类） */
  options: string[];
}

export interface PluralUse {
  name: string;
  options: string[];
}

// 展开后的占位：普通参数和复数里的 #（渲染出来是数字或用户数据）、系统用词（渲染出一个词）
export const PARAM_MARK = "";
export const TERM_MARK = "";
export const MAX_VARIANTS = 256;

export function parseMessage(message: string): MessageFormatElement[] {
  return parse(message);
}

function walkUses(elements: MessageFormatElement[], out: ArgUse[]): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        out.push({ name: element.value, kind: "argument", options: [] });
        break;
      case TYPE.number:
        out.push({ name: element.value, kind: "number", options: [] });
        break;
      case TYPE.date:
        out.push({ name: element.value, kind: "date", options: [] });
        break;
      case TYPE.time:
        out.push({ name: element.value, kind: "time", options: [] });
        break;
      case TYPE.select:
      case TYPE.plural:
        out.push({
          name: element.value,
          kind: element.type === TYPE.select ? "select" : "plural",
          options: Object.keys(element.options),
        });
        for (const option of Object.values(element.options)) walkUses(option.value, out);
        break;
      case TYPE.tag:
        out.push({ name: element.value, kind: "tag", options: [] });
        walkUses(element.children, out);
        break;
      default:
        break;
    }
  }
}

// 全部参数用法，包括系统自动填的 platform 和 term_*
export function argUses(message: string): ArgUse[] {
  const out: ArgUse[] = [];
  walkUses(parseMessage(message), out);
  return out;
}

export function userArgUses(message: string): ArgUse[] {
  return argUses(message).filter((use) => !isAutoParam(use.name));
}

export function pluralUses(message: string): PluralUse[] {
  return argUses(message)
    .filter((use) => use.kind === "plural")
    .map(({ name, options }) => ({ name, options }));
}

// 把文案展开成“一行字”的所有写法：select、plural 每个分支各算一种，参数换成占位符。
// 分支组合超过 MAX_VARIANTS 时截断，检查是尽力而为但方向安全（多半多报不漏报）。
export function flatVariants(message: string): string[] {
  const expand = (elements: MessageFormatElement[]): string[] => {
    let results = [""];
    for (const element of elements) {
      let parts: string[];
      switch (element.type) {
        case TYPE.literal:
          parts = [element.value];
          break;
        case TYPE.argument:
        case TYPE.number:
        case TYPE.date:
        case TYPE.time:
          parts = [isAutoParam(element.value) ? TERM_MARK : PARAM_MARK];
          break;
        case TYPE.pound:
          parts = [PARAM_MARK];
          break;
        case TYPE.tag:
          parts = expand(element.children);
          break;
        case TYPE.select:
        case TYPE.plural:
          parts = Object.values(element.options).flatMap((option) => expand(option.value));
          break;
        default:
          parts = [""];
      }
      const next: string[] = [];
      for (const head of results) {
        for (const tail of parts) {
          next.push(head + tail);
          if (next.length >= MAX_VARIANTS) break;
        }
        if (next.length >= MAX_VARIANTS) break;
      }
      results = next;
    }
    return [...new Set(results)];
  };
  return expand(parseMessage(message));
}

// 只留写死的文字（去掉全部占位符）
export function literalOnly(variant: string): string {
  return variant.replaceAll(PARAM_MARK, "").replaceAll(TERM_MARK, "");
}
