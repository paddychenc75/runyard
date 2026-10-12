import { z } from "zod";
import { defineFileFormat } from "./file-format.ts";
import { timestampSchema } from "./primitives.ts";
import { toolCheckSchema } from "./tool-check.ts";

// ~/.runyard/state/toolchain.json：工具检测结果的缓存（决策记录 0009，TOOLCHAIN-DETECTION-02）。
// 缓存的键和有效期已定：键由登录 shell 加启动文件 mtime 的指纹组成，项目有版本文件时再加项目路径；
// 有效期 1 小时。键怎样拼出来是 core 的事，这里把它当不透明字符串。
// 缓存里不留检测所用的 PATH：只有每个工具的结论（ToolCheck），与 toolchain.check 的出参同形。

export const TOOLCHAIN_FILE_VERSION = 1;

export const TOOLCHAIN_CACHE_TTL_MS = 60 * 60 * 1000;

export const toolchainCacheEntrySchema = z.object({
  checkedAt: timestampSchema,
  tools: z.array(toolCheckSchema),
});
export type ToolchainCacheEntry = z.infer<typeof toolchainCacheEntrySchema>;

export const toolchainFileSchema = z.object({
  formatVersion: z.literal(TOOLCHAIN_FILE_VERSION),
  entries: z.record(z.string().min(1), toolchainCacheEntrySchema),
});
export type ToolchainFile = z.infer<typeof toolchainFileSchema>;

// 坏了就丢：只是缓存，下次检测会重建
export const toolchainFileFormat = defineFileFormat({
  name: "toolchain.json",
  currentVersion: TOOLCHAIN_FILE_VERSION,
  schema: toolchainFileSchema,
  migrations: {},
  recovery: "discard",
});

// 缓存是否仍有效。时间由调用方给（这里不读时钟）；时钟回拨（now < checkedAt）按过期算
export function isToolchainCacheFresh(entry: ToolchainCacheEntry, now: number): boolean {
  return now >= entry.checkedAt && now - entry.checkedAt < TOOLCHAIN_CACHE_TTL_MS;
}
