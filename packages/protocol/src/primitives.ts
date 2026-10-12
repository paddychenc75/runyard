import { z } from "zod";

// 方法和事件的字段共用的几个小类型。只放“形状”，不放逻辑。

// UTC 毫秒数；协议和文件里不存时区（技术设计 §5.1）
export const timestampSchema = z.number().int().nonnegative();

// 本机端口。范围检查只管“是不是合法的端口号”；用哪个端口是 core 的事
export const portSchema = z.number().int().min(1).max(65535);

// 项目：id 或名称都可以（命令行允许两者，技术设计 §5.2）
export const playgroundRefSchema = z.string().min(1).describe("项目的 id 或名称");

// 没有字段的入参或出参。入参一律传 {}，不省略 params
export const emptySchema = z.object({});
export type Empty = z.infer<typeof emptySchema>;

// 日志里的一个位置，格式 <runId>:<序号>，对调用方不透明（规格 RUN-LOGS-16）
export const logCursorSchema = z
  .string()
  .regex(/^[^:\s]+:\d+$/)
  .describe("日志游标，格式 <runId>:<序号>，对调用方不透明，只原样传回");
export type LogCursor = z.infer<typeof logCursorSchema>;

// 订阅类方法的返回值；事件帧里的 sub 就是它（技术设计 §5.1 信封）
export const subscriptionSchema = z.object({ sub: z.number().int().nonnegative() });
