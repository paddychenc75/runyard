import { z } from "zod";
import { createdBySchema } from "./created-by.ts";
import { defineFileFormat } from "./file-format.ts";
import { autoCleanSchema, packageManagers, playgroundSchema } from "./playground.ts";
import { relativePathSchema, timestampSchema } from "./primitives.ts";
import { requestSpecSchema } from "./request.ts";
import { templateInstallSchema } from "./template-file.ts";

// 项目文件夹里的 .runyard/playground.json（docs/architecture/storage.md 2.1）。
// 共用的形状（template、createdBy、autoClean、packageManager、entry）直接取自 Playground，
// 不另写一份。名称不存，永远取文件夹名；端口和使用时间在 library.json。
//
// 未知字段：顶层原样保留（looseObject）。这个文件随文件夹被拷走、被 git 管，
// 旧程序读到新写的字段时不能在写回时丢掉它们。

const toolId = z.string().min(1);

export const PLAYGROUND_FILE_VERSION = 1;

export const playgroundFileSchema = z.looseObject({
  formatVersion: z.literal(PLAYGROUND_FILE_VERSION),
  id: playgroundSchema.shape.id,
  template: playgroundSchema.shape.template,
  runner: playgroundSchema.shape.runner,
  requires: z.record(toolId, z.string()).describe("创建时从模板复制的工具与版本范围"),
  // 创建时从模板 requires 复制的 install，只展示不执行；没有就不写这个字段。
  // 单独一个字段而不改 requires 的值：旧程序读 requires 仍是 { 工具: 范围 }，不用升格式版本
  requiresInstall: z
    .record(toolId, templateInstallSchema)
    .optional()
    .describe("创建时从模板复制的安装方式（只展示）"),
  toolchainAtCreate: z.record(toolId, z.string().min(1)).describe("创建时各工具的实际版本"),
  packageManager: z.enum(packageManagers).optional(),
  entry: relativePathSchema.optional(),
  open: z.array(relativePathSchema).optional().describe("创建时打开的文件"),
  note: z.string().optional(),
  createdAt: timestampSchema,
  createdBy: createdBySchema,
  autoClean: autoCleanSchema,
  script: z.object({ autoRun: z.boolean().optional() }).optional(),
  // 请求面板上一次发出的请求（规格 DESKTOP-REQUEST-PANEL-08）
  lastRequest: requestSpecSchema.optional(),
  // 请求面板“服务重载后自动重发”的开合；没写过就是开（规格 DESKTOP-REQUEST-PANEL-15）
  requestAutoResend: z.boolean().optional(),
  trust: z.literal("trusted").describe("第一版恒为 trusted"),
});
export type PlaygroundFile = z.infer<typeof playgroundFileSchema>;

// 坏了就跳过这个文件夹并报告，不重写它（不能凭空重建身份：id 只存在这个文件里）
export const playgroundFileFormat = defineFileFormat({
  name: "playground.json",
  currentVersion: PLAYGROUND_FILE_VERSION,
  schema: playgroundFileSchema,
  migrations: {},
  recovery: "skip",
});
