import { z } from "zod";
import { createdBySchema } from "./created-by.ts";
import { runKindSchema } from "./enums.ts";
import { portSchema, timestampSchema } from "./primitives.ts";

// 项目记录在协议里的形状：合并项目文件夹里的 playground.json 和本机索引 library.json
// 里客户端用得到的字段（docs/architecture/storage.md 第 2 节）。
// 名称不单独存，是文件夹名的显示（技术设计 §4.1）。磁盘上才有的字段
// （requires、toolchainAtCreate、open、trust、clean 的提醒状态）不进协议。
// “已保留”不是单独的字段：autoClean.enabled 为 false 就是已保留（术语表）。

export const packageManagers = ["pnpm", "npm"] as const;

export const autoCleanSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().positive().optional(),
});
export type AutoClean = z.infer<typeof autoCleanSchema>;

export const playgroundSchema = z
  .object({
    id: z.string().min(1).describe("创建时生成、之后不变；文件夹改名或移动后靠它认回"),
    name: z.string().min(1).describe("文件夹名"),
    path: z.string().min(1).describe("文件夹的绝对路径"),
    kind: runKindSchema,
    template: z.object({
      id: z.string().min(1),
      source: z.enum(["builtin", "user"]),
      appVersion: z.string().min(1),
    }),
    runner: z.string().min(1).describe("运行器 id"),
    packageManager: z.enum(packageManagers).optional(),
    entry: z.string().min(1).optional().describe("入口文件，用 / 分隔的相对路径"),
    note: z.string().optional(),
    createdAt: timestampSchema,
    createdBy: createdBySchema,
    autoClean: autoCleanSchema,
    scriptAutoRun: z.boolean().optional().describe("脚本项目保存后自动运行"),
    port: portSchema.optional().describe("登记的端口；脚本没有"),
    lastUsedAt: timestampSchema,
    lastOpenedAt: timestampSchema.optional(),
    missingSince: timestampSchema.optional().describe("找不到文件夹的起始时间"),
  })
  .meta({ id: "Playground" });
export type Playground = z.infer<typeof playgroundSchema>;
