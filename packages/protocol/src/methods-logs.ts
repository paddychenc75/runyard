import { z } from "zod";
import { runStateSchema } from "./enums.ts";
import { logEntrySchema } from "./log-entry.ts";
import type { MethodDefinition } from "./method-definition.ts";
import {
  emptySchema,
  logCursorSchema,
  playgroundRefSchema,
  subscriptionSchema,
} from "./primitives.ts";

// 日志组（规格 run/logs；技术设计 §5.2）。条目形状都是 LogEntry。

const readParams = z.object({
  playground: playgroundRefSchema,
  since: logCursorSchema.optional().describe("只返回这个游标之后的内容"),
  tail: z.number().int().positive().optional().describe("只要最后几行；命令行默认传 200"),
  raw: z.boolean().optional().describe("true：原样返回，不清洗"),
});

export const logsMethods = {
  "logs.read": {
    group: "logs",
    summary:
      "读日志。默认返回清洗后的文本，raw 为 true 时原样；游标属于更早一次运行时返回当前运行全部并标 truncated",
    params: readParams,
    result: z.object({
      entries: z.array(logEntrySchema),
      cursor: logCursorSchema.describe("下次传给 since 的游标"),
      truncated: z.boolean(),
      state: runStateSchema.optional().describe("最近一次运行的状态；项目从没运行过时没有"),
    }),
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
  "logs.follow": {
    group: "logs",
    summary: "订阅一个项目的日志；之后的新条目以 run.log 事件推送，经 events.unsubscribe 取消",
    params: readParams,
    result: subscriptionSchema,
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
  "logs.clear": {
    group: "logs",
    summary: "清除一个项目的日志",
    params: z.object({ playground: playgroundRefSchema }),
    result: emptySchema,
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
