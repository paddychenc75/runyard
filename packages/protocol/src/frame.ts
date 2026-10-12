import { z } from "zod";
import { type RunyardError, runyardErrorSchema } from "./errors.ts";

// 连接上握手完成之后的四种帧（技术设计 §5.1；docs/architecture/protocol.md §3）。
// 对象默认丢弃不认识的字段，所以新增可选字段不需要升协议版本（规格 PROTOCOL-HANDSHAKE-20）。

const counter = z.number().int().nonnegative();

// 线上的错误：code 只要求是非空字符串。新版管理进程可能返回旧客户端没登记的代码，
// 若在这里就按登记表校验，整帧会被当成坏帧丢掉，请求永远等不到响应（规格 PROTOCOL-HANDSHAKE-17）
export const wireErrorSchema = z.object({
  code: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  debug: z.string(),
  cause: z.unknown().optional(),
});
export type WireError = z.infer<typeof wireErrorSchema>;

// 登记过的错误码就收窄成 RunyardError，否则返回 undefined，由调用方显示通用的一句话加 code
export function toKnownError(error: WireError): RunyardError | undefined {
  const parsed = runyardErrorSchema.safeParse(error);
  return parsed.success ? parsed.data : undefined;
}

export const requestFrameSchema = z.object({
  t: z.literal("req"),
  id: counter,
  method: z.string().min(1),
  params: z.unknown(),
});

export const resultFrameSchema = z.object({
  t: z.literal("res"),
  id: counter,
  ok: z.literal(true),
  result: z.unknown(),
});

export const errorFrameSchema = z.object({
  t: z.literal("res"),
  id: counter,
  ok: z.literal(false),
  error: wireErrorSchema,
});

export const eventFrameSchema = z.object({
  t: z.literal("evt"),
  sub: counter,
  seq: counter,
  event: z.string().min(1),
  data: z.unknown(),
});

export const frameSchema = z.union([
  requestFrameSchema,
  resultFrameSchema,
  errorFrameSchema,
  eventFrameSchema,
]);

export type RequestFrame = z.infer<typeof requestFrameSchema>;
export type ResultFrame = z.infer<typeof resultFrameSchema>;
export type ErrorFrame = z.infer<typeof errorFrameSchema>;
export type EventFrame = z.infer<typeof eventFrameSchema>;
export type Frame = z.infer<typeof frameSchema>;
