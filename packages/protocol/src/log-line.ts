import { z } from "zod";
import { logEntrySchema } from "./log-entry.ts";

// 运行日志文件里的一行（决策记录 0008；storage.md 2.5）：一个 JSON 对象，形状是 LogEntry
// 再加序号 seq。stdout、stderr 的 text 是已解码、未清洗的整行，颜色码、\r、BOM 原样保留。
// seq 在一次运行内按到达顺序递增，日志游标 <runId>:<seq> 指的就是它；
// 磁盘上掐掉旧行之后序号也不重排，游标因此一直有效。
// 日志文件没有 formatVersion：它是追加写的流，每行自己带形状，不走整文件的升级链。

export const logLineSchema = z.intersection(
  logEntrySchema,
  z.object({ seq: z.number().int().nonnegative() }),
);
export type LogLine = z.infer<typeof logLineSchema>;

export function encodeLogLine(line: LogLine): string {
  return `${JSON.stringify(logLineSchema.parse(line))}\n`;
}

export type LogLineResult = { ok: true; line: LogLine } | { ok: false };

// 读一行（不含结尾换行）。崩溃时最后一行常常只写了一半，坏行不是错误：返回 ok: false，
// 调用方跳过它继续读后面的
export function parseLogLine(text: string): LogLineResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  const parsed = logLineSchema.safeParse(raw);
  return parsed.success ? { ok: true, line: parsed.data } : { ok: false };
}
