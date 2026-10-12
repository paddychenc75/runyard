import { z } from "zod";
import { eventTopicSchema, shutdownReasonSchema } from "./enums.ts";
import { clientKindSchema } from "./handshake.ts";
import type { MethodDefinition } from "./method-definition.ts";
import { emptySchema, subscriptionSchema } from "./primitives.ts";
import { protocolVersionSchema } from "./protocol-version.ts";

// 会话组和事件订阅（技术设计 §5.2；规格 RUN-OWNERSHIP-06、SUPERVISOR-LIFECYCLE-15）。
// challenge / hello 是握手帧，不是方法，见 handshake.ts。

export const sessionMethods = {
  ping: {
    group: "session",
    summary: "存活探测",
    params: emptySchema,
    result: emptySchema,
    errors: [],
    status: "defined",
  },
  "session.bye": {
    group: "session",
    summary: "桌面应用正常退出：管理进程停掉这条连接名下所有标签页持有的运行，最多等 5 秒",
    params: emptySchema,
    result: emptySchema,
    errors: [],
    status: "defined",
  },
  "supervisor.info": {
    group: "session",
    summary: "管理进程自己的信息，命令行 doctor 用",
    params: emptySchema,
    result: z.object({
      protocol: protocolVersionSchema,
      version: z.string().min(1).describe("产品版本"),
      build: z.string().min(1).describe("构建标识"),
      startedBy: clientKindSchema,
      runs: z.number().int().nonnegative().describe("运行个数，口径同 run.state 的 runningCount"),
    }),
    errors: [],
    status: "defined",
  },
  "supervisor.shutdown": {
    group: "session",
    summary: "请管理进程退出；不在界面进程的白名单内。ifIdle 为 true 时只在没有运行时才退出",
    params: z.object({ ifIdle: z.boolean(), reason: shutdownReasonSchema }),
    result: z.object({ closing: z.boolean().describe("false：因为还有运行，没有关闭") }),
    errors: [],
    status: "defined",
  },
  "events.subscribe": {
    group: "events",
    summary: "按主题订阅事件；事件帧里的 sub 就是这里返回的值",
    params: z.object({ topics: z.array(eventTopicSchema).min(1) }),
    result: subscriptionSchema,
    errors: [],
    status: "defined",
  },
  "events.unsubscribe": {
    group: "events",
    summary: "取消一个订阅（events.subscribe 或 logs.follow 返回的）",
    params: subscriptionSchema,
    result: emptySchema,
    errors: [],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
