import type { z } from "zod";
import type { ErrorCode } from "./errors.ts";

// 方法登记表里一项的形状。登记表（methods.ts）是方法名唯一的定义处：
// 处理函数、调用方、参考文档都从它推出，不各写一份字符串（技术设计 §5.2）。

export const methodGroups = [
  "session",
  "events",
  "library",
  "run",
  "logs",
  "toolchain",
  "settings",
  "request",
] as const;
export type MethodGroup = (typeof methodGroups)[number];

export interface MethodDefinition {
  group: MethodGroup;
  // 给参考文档用的一句话，不是给用户看的文案（用户看到的文字只来自 i18n）
  summary: string;
  params: z.ZodType;
  result: z.ZodType;
  // 除了 USAGE（入参不合法）和 INTERNAL 之外，这个方法可能返回的错误码
  errors: readonly ErrorCode[];
  // reserved：只占名字。入参和出参的形状等对应规格批准后再定，管理进程现在回 NOT_SUPPORTED
  status: "defined" | "reserved";
}
