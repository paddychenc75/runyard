// 生成 JSON 文件时用的排版，写得和 Biome 的 JSON 格式化结果一致（Biome 也会检查这些文件，
// 两边不一致就会一个说过期、一个说格式不对）：对象总是逐行展开；数组里全是简单值且一行放得下
// 就写在一行，否则一项一行。缩进 2 个空格，行宽 100。
const LINE_WIDTH = 100;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isPrimitive = (value: Json): value is null | boolean | number | string =>
  value === null || typeof value !== "object";

function render(value: Json, indent: string, prefixWidth: number): string {
  if (isPrimitive(value)) return JSON.stringify(value);
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    if (value.every(isPrimitive)) {
      const line = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
      if (indent.length + prefixWidth + line.length + 1 <= LINE_WIDTH) return line;
    }
    const items = value.map((item) => `${inner}${render(item, inner, 0)}`);
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([key, item]) => {
    const head = `${JSON.stringify(key)}: `;
    return `${inner}${head}${render(item, inner, head.length)}`;
  });
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

export function formatJson(value: unknown): string {
  return `${render(value as Json, "", 0)}\n`;
}
