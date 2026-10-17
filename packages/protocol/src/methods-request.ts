import { z } from "zod";
import type { MethodDefinition } from "./method-definition.ts";
import { playgroundRefSchema } from "./primitives.ts";
import { requestResultSchema, requestSpecSchema } from "./request.ts";

// 请求面板组（规格 desktop/request-panel）。连不上、超时、服务没就绪都是结果里的
// outcome: "failed"，不是协议错误：界面要把原因写在响应区。

export const requestMethodsRegistry = {
  "request.send": {
    group: "request",
    summary:
      "对项目自己的服务发一个请求（只发往它运行的 127.0.0.1:端口，30 秒超时），并记为上一次请求；计一次空闲活动",
    params: z.object({ playground: playgroundRefSchema, request: requestSpecSchema }),
    result: requestResultSchema,
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
  "request.getLast": {
    group: "request",
    summary: "取上一次发出的请求；从没发过是 null",
    params: z.object({ playground: playgroundRefSchema }),
    result: requestSpecSchema.nullable(),
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
