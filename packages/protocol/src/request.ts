import { z } from "zod";

// 请求面板的请求与结果（规格 desktop/request-panel；PRD #prd-request-panel）。
// 请求只发往项目自己的 127.0.0.1:<端口>：目标由管理进程按运行的端口拼，调用方只能给路径，
// 所以这里没有主机、协议、端口字段。

export const requestMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export const requestMethodSchema = z.enum(requestMethods);
export type RequestMethod = z.infer<typeof requestMethodSchema>;

/** 等响应的最长时间；到点算超时（规格 DESKTOP-REQUEST-PANEL-07） */
export const REQUEST_TIMEOUT_MS = 30_000;

export const requestHeaderSchema = z.object({ name: z.string().min(1), value: z.string() });
export type RequestHeader = z.infer<typeof requestHeaderSchema>;

export const requestSpecSchema = z
  .object({
    method: requestMethodSchema,
    path: z.string().startsWith("/").describe("以 / 开头的路径加查询串；写别的主机也只是路径"),
    headers: z.array(requestHeaderSchema).describe("按填写顺序，允许同名"),
    payload: z
      .string()
      .describe("请求体；GET 不带。字段不叫 body：协议里 body 是面向用户文字的保留名"),
  })
  .meta({ id: "RequestSpec" });
export type RequestSpec = z.infer<typeof requestSpecSchema>;

export const requestFailureReasons = [
  "not-ready",
  "timeout",
  "unreachable",
  "disconnected",
  "too-large",
  "invalid-request",
  "invalid-request",
] as const;
export const requestFailureReasonSchema = z.enum(requestFailureReasons);
export type RequestFailureReason = z.infer<typeof requestFailureReasonSchema>;

export const requestResultSchema = z
  .discriminatedUnion("outcome", [
    z.object({
      outcome: z.literal("response"),
      status: z.number().int(),
      statusText: z.string(),
      durationMs: z.number().nonnegative(),
      size: z.number().int().nonnegative().describe("响应体的字节数"),
      headers: z.array(requestHeaderSchema),
      payload: z.string().describe("响应体，按 UTF-8 解出的文字"),
    }),
    z.object({
      outcome: z.literal("failed"),
      reason: requestFailureReasonSchema,
      durationMs: z.number().nonnegative(),
    }),
  ])
  .meta({ id: "RequestResult" });
export type RequestResult = z.infer<typeof requestResultSchema>;
