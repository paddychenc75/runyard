import type { RunnerReady, TemplateCategory } from "@runyard/protocol";
import type { TemplatePageRow, TemplateToolRow } from "../../../shared/templates-view.ts";
import { categoryOrder } from "../../picker-view.ts";

// 模板页要的纯判断：分组、版本范围的写法、就绪判断的写法、无效原因对应的文案。不碰 DOM，不生成文字。

export interface TemplateGroup {
  category: TemplateCategory;
  rows: TemplatePageRow[];
}

/** 按类型分组，用户自己的在最后的“我的”；空的分组不出现（规格 DESKTOP-TEMPLATES-VIEW-01） */
export function groupTemplates(rows: readonly TemplatePageRow[]): TemplateGroup[] {
  return categoryOrder.flatMap((category) => {
    const inCategory = rows.filter((row) => row.category === category);
    return inCategory.length === 0 ? [] : [{ category, rows: inCategory }];
  });
}

export function countTemplates(rows: readonly TemplatePageRow[]): {
  builtin: number;
  user: number;
} {
  const user = rows.filter((row) => row.source === "user").length;
  return { builtin: rows.length - user, user };
}

export interface RangePart {
  /** 比较符，已换成数学符号（≥ ≤ < > =）；没写比较符是 null */
  op: string | null;
  version: string;
}

const OPERATORS: Record<string, string> = { ">=": "≥", "<=": "≤", ">": ">", "<": "<", "=": "=" };

/** “>=20.19 <27”拆成 [≥ 20.19, < 27]；调用方在两段之间放“且” */
export function rangeParts(range: string): RangePart[] {
  return range
    .split(/\s+/)
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^(>=|<=|>|<|=)?(.*)$/.exec(part);
      const op = match?.[1];
      return { op: op === undefined ? null : (OPERATORS[op] ?? op), version: match?.[2] ?? part };
    });
}

/** 一段范围的写法：“≥ 20.19”；没有比较符就只有版本 */
export function rangePartText(part: RangePart): string {
  return part.op === null ? part.version : `${part.op} ${part.version}`;
}

/** 工具的显示名：常见的几个按它们自己的写法，其余用标识 */
export function toolLabel(tool: string): string {
  switch (tool) {
    case "node":
      return "Node";
    case "python":
      return "Python";
    case "go":
      return "Go";
    default:
      return tool;
  }
}

export type ToolVerdict = "met" | "tooOld" | "missing" | null;

/** 状态列：没检测过（unknown）留空，不触发检测也不猜（规格 DESKTOP-TEMPLATES-VIEW-04） */
export function verdictOf(row: TemplateToolRow): ToolVerdict {
  switch (row.status) {
    case "found":
      return "met";
    case "too-old":
      return "tooOld";
    case "missing":
      return "missing";
    case "unknown":
      return null;
  }
}

export type ReadyView =
  | { kind: "http"; url: string }
  | { kind: "port" }
  | { kind: "log"; match: string };

/** 就绪判断的写法：地址里的 {port} 原样保留，运行时才有端口（设计稿 Templates） */
export function readyViewOf(ready: RunnerReady): ReadyView {
  if ("http" in ready) return { kind: "http", url: `http://127.0.0.1:{port}${ready.http.path}` };
  if ("port" in ready) return { kind: "port" };
  return { kind: "log", match: ready.log.match };
}
