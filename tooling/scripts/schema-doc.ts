import { z } from "zod";

// 把 zod 定义变成 Markdown 里的类型文字和字段表（给 pnpm generate 的参考文档用）。
// 走 JSON Schema 这一层：zod 自己负责把定义翻成 JSON Schema，这里只管排版，
// 所以协议里新写的 schema 不需要在这里登记。

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: JsonSchema | boolean;
  description?: string;
  pattern?: string;
  format?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  minLength?: number;
  minItems?: number;
  $defs?: Record<string, JsonSchema>;
};

export interface Converted {
  schema: JsonSchema;
  // 带名字（meta.id）的共用类型
  defs: Record<string, JsonSchema>;
}

export function convert(schema: z.ZodType, io: "input" | "output"): Converted {
  const {
    $defs,
    $schema: _ignored,
    ...rest
  } = z.toJSONSchema(schema, {
    io,
    unrepresentable: "any",
  }) as JsonSchema & { $schema?: string };
  return { schema: rest, defs: $defs ?? {} };
}

const refName = (ref: string) => ref.replace("#/$defs/", "");

// 紧凑的类型文字。嵌套对象写成 { a: string; b?: number }
export function typeText(node: JsonSchema): string {
  if (node.$ref !== undefined) return refName(node.$ref);
  if (node.const !== undefined) return JSON.stringify(node.const).replaceAll('"', "'");
  if (node.enum !== undefined)
    return node.enum.map((v) => JSON.stringify(v).replaceAll('"', "'")).join(" | ");
  const union = node.anyOf ?? node.oneOf;
  if (union !== undefined) return union.map(typeText).join(" | ");
  if (Array.isArray(node.type)) return node.type.join(" | ");
  if (node.type === "array") {
    const inner = typeText(node.items ?? {});
    return inner.includes(" | ") ? `(${inner})[]` : `${inner}[]`;
  }
  if (node.type === "object") return objectText(node);
  if (node.type === undefined) return "任意";
  return node.type;
}

function objectText(node: JsonSchema): string {
  const entries = Object.entries(node.properties ?? {});
  if (entries.length === 0) {
    if (typeof node.additionalProperties === "object") {
      return `Record<string, ${typeText(node.additionalProperties)}>`;
    }
    return "{}";
  }
  const required = new Set(node.required ?? []);
  const fields = entries.map(
    ([name, child]) => `${name}${required.has(name) ? "" : "?"}: ${typeText(child)}`,
  );
  return `{ ${fields.join("; ")} }`;
}

// 类型之外的约束，写进“说明”列
export function constraints(node: JsonSchema): string[] {
  const result: string[] = [];
  if (node.pattern !== undefined && node.format !== "starts_with")
    result.push(`格式 \`${node.pattern}\``);
  if (node.format === "starts_with" && node.pattern !== undefined) {
    result.push(
      `以 ${node.pattern.replace(/^\^/, "").replace(/\.\*$/, "").replaceAll("\\", "")} 开头`,
    );
  }
  if (node.minLength !== undefined && node.minLength > 0) result.push("非空");
  if (node.minItems !== undefined && node.minItems > 0) result.push("至少一项");
  // zod 给整数加的是安全整数的上下界，不是真约束，不写
  if (node.minimum !== undefined && Math.abs(node.minimum) < 2 ** 40)
    result.push(`≥ ${node.minimum}`);
  if (node.exclusiveMinimum !== undefined) result.push(`> ${node.exclusiveMinimum}`);
  if (node.maximum !== undefined && Math.abs(node.maximum) < 2 ** 40)
    result.push(`≤ ${node.maximum}`);
  return result;
}

const cell = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
const code = (text: string) => `\`${cell(text)}\``;

function table(node: JsonSchema): string {
  const entries = Object.entries(node.properties ?? {});
  if (entries.length === 0) return "无字段（`{}`）";
  const required = new Set(node.required ?? []);
  const rows = entries.map(([name, child]) => {
    const note = [child.description ?? "", ...constraints(child)]
      .filter((s) => s !== "")
      .join("；");
    return `| ${code(name)} | ${code(typeText(child))} | ${required.has(name) ? "是" : "否"} | ${cell(note)} |`;
  });
  return ["| 字段 | 类型 | 必填 | 说明 |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

// 联合类型的一个分支叫什么：取第一个取值固定的字段（如 kind = 'tab'）
function variantLabel(variant: JsonSchema): string {
  for (const [name, child] of Object.entries(variant.properties ?? {})) {
    if (child.const !== undefined || child.enum !== undefined)
      return `${name} = ${typeText(child)}`;
  }
  return typeText(variant);
}

// 一个 schema 的说明：对象写字段表；每个分支都是对象的联合，每个分支一张表；
// 其余（数组、引用、任意）写成一行类型
export function fieldsTable(node: JsonSchema, defs: Record<string, JsonSchema>): string {
  const resolved = node.$ref !== undefined ? (defs[refName(node.$ref)] ?? node) : node;
  if (node.$ref !== undefined) return `类型 ${code(typeText(node))}`;
  const variants = resolved.anyOf ?? resolved.oneOf;
  if (variants?.every((v) => v.type === "object" && v.properties !== undefined)) {
    const blocks = variants.map((v) => `**${code(variantLabel(v))}**\n\n${table(v)}`);
    return ["以下几种之一：", "", ...blocks.flatMap((b) => [b, ""])].join("\n").trimEnd();
  }
  if (resolved.type !== "object" || resolved.properties === undefined) {
    return `类型 ${code(typeText(node))}`;
  }
  return table(resolved);
}
