import { z } from "zod";

// 随数据走的可翻译文字（技术设计 §6.8）：要么一个字符串（所有语言一样，专有名词用），
// 要么“语言 → 文字”的对象且 en 必填。协议原样转发，不替客户端挑语言。
export const localizedTextSchema = z
  .union([z.string(), z.object({ en: z.string() }).catchall(z.string())])
  .meta({ id: "LocalizedText" });
export type LocalizedText = z.infer<typeof localizedTextSchema>;
