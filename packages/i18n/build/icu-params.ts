import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";

// 从一条 ICU 文案推出参数表：参数名 → TypeScript 类型文本（技术设计 §6.8“类型靠生成”）。

export type ParamTypes = Map<string, string>;

const TEXT = "string | number";
const NUMBER = "number";
const DATE = "number | Date";
const SELECT = "string";
const TAG = "(chunks: string[]) => string";

// 同一个参数在一条文案里被用成不同类型时，取更具体的那个；真正冲突（数字对字符串选择）直接报错
const rank = new Map([
  [TEXT, 0],
  [SELECT, 1],
  [NUMBER, 1],
  [DATE, 1],
  [TAG, 2],
]);

function add(types: ParamTypes, name: string, type: string): void {
  const existing = types.get(name);
  if (existing === undefined || existing === type) {
    types.set(name, type);
    return;
  }
  const a = rank.get(existing) ?? 0;
  const b = rank.get(type) ?? 0;
  if (a === b) throw new Error(`参数 ${name} 同时被当作 ${existing} 和 ${type} 使用`);
  if (b > a) types.set(name, type);
}

// `term_` 开头的参数和 `platform` 由文案系统自动填，调用的人不用传（技术设计 §6.8“随系统变的用词”）
export function isAutoParam(name: string): boolean {
  return name === "platform" || name.startsWith("term_");
}

function walk(elements: MessageFormatElement[], types: ParamTypes): void {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
        add(types, element.value, TEXT);
        break;
      case TYPE.number:
        add(types, element.value, NUMBER);
        break;
      case TYPE.date:
      case TYPE.time:
        add(types, element.value, DATE);
        break;
      case TYPE.select:
        add(types, element.value, SELECT);
        for (const option of Object.values(element.options)) walk(option.value, types);
        break;
      case TYPE.plural:
        add(types, element.value, NUMBER);
        for (const option of Object.values(element.options)) walk(option.value, types);
        break;
      case TYPE.tag:
        add(types, element.value, TAG);
        walk(element.children, types);
        break;
      default:
        break;
    }
  }
}

export function paramTypesOf(message: string): ParamTypes {
  const types: ParamTypes = new Map();
  walk(parse(message), types);
  for (const name of [...types.keys()]) if (isAutoParam(name)) types.delete(name);
  return types;
}
