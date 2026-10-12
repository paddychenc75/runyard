import { z } from "zod";
import { defineFileFormat } from "./file-format.ts";
import { playgroundSchema } from "./playground.ts";
import { timestampSchema } from "./primitives.ts";

// ~/.runyard/state/library.json：本机索引（storage.md 2.2）。
// 端口登记表就是各项的 port，不另开文件；脚本没有端口。
// 索引丢了或坏了从磁盘重扫重建（端口重新分配，lastUsedAt 取当前时间，清理只会变晚）。
// 未知字段：顶层和每一项都原样保留。

export const LIBRARY_FILE_VERSION = 1;

// 清理提醒的状态；计时在这里而不在 playground.json（autoClean 只有开关和天数）
export const cleanStateSchema = z.object({
  remindedAt: timestampSchema.optional().describe("提醒上次显示的时间"),
  snoozedUntil: timestampSchema.optional().describe("顺延到何时"),
});
export type CleanState = z.infer<typeof cleanStateSchema>;

export const libraryEntrySchema = z.looseObject({
  id: playgroundSchema.shape.id,
  path: playgroundSchema.shape.path,
  port: playgroundSchema.shape.port,
  lastUsedAt: playgroundSchema.shape.lastUsedAt,
  lastOpenedAt: playgroundSchema.shape.lastOpenedAt,
  clean: cleanStateSchema.optional(),
  missingSince: playgroundSchema.shape.missingSince,
});
export type LibraryEntry = z.infer<typeof libraryEntrySchema>;

export const libraryFileSchema = z.looseObject({
  formatVersion: z.literal(LIBRARY_FILE_VERSION),
  root: z.string().min(1).describe("资源库根目录的绝对路径"),
  playgrounds: z.array(libraryEntrySchema),
});
export type LibraryFile = z.infer<typeof libraryFileSchema>;

export const libraryFileFormat = defineFileFormat({
  name: "library.json",
  currentVersion: LIBRARY_FILE_VERSION,
  schema: libraryFileSchema,
  migrations: {},
  recovery: "rescan",
});
