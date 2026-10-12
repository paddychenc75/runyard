import { z } from "zod";
import { noticeSchema } from "./notices.ts";

// 日志条目（技术设计 §5.1）。进程自己的输出原样带着：stdout、stderr 的 text 是已解码、
// 未清洗的整行，读取时才清洗（决策记录 0008）；管理进程插入的提示是结构化的。
// at 是 UTC 毫秒数，协议和文件里不存时区。
const at = z.number().int().nonnegative();

export const logEntrySchema = z
  .discriminatedUnion("kind", [
    z.object({ at, kind: z.enum(["stdout", "stderr", "command"]), text: z.string() }),
    z.object({ at, kind: z.literal("system"), notice: noticeSchema }),
  ])
  .meta({ id: "LogEntry" });
export type LogEntry = z.infer<typeof logEntrySchema>;
