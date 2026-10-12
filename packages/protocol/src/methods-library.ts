import { z } from "zod";
import { createdByKinds, createdBySchema } from "./created-by.ts";
import type { MethodDefinition } from "./method-definition.ts";
import { playgroundSchema } from "./playground.ts";
import { emptySchema, playgroundRefSchema } from "./primitives.ts";

// 资源库组（技术设计 §5.2、docs/architecture/protocol-methods.md 第 2 节；
// 规格 library/playgrounds）。名称的校验（字符、长度、保留名、重名）是 core 的事，
// 入参只要求非空：否则 schema 会先拒绝，调用方拿到的是 USAGE 而不是规格要求的 NAME_INVALID。

const name = z.string().min(1);
// 天数；开启自动清理时给，具体含义见自动清理的规格（尚未批准）
const autoCleanDays = z.number().int().positive();

export const playgroundFilterSchema = z.object({
  running: z.boolean().optional().describe("只要有运行中的"),
  createdBy: z.enum(createdByKinds).optional(),
});

export const libraryMethods = {
  "playground.list": {
    group: "library",
    summary: "列出资源库里的项目",
    params: z.object({ filter: playgroundFilterSchema.optional() }),
    result: z.array(playgroundSchema),
    errors: [],
    status: "defined",
  },
  "playground.get": {
    group: "library",
    summary: "取一个项目",
    params: z.object({ playground: playgroundRefSchema }),
    result: playgroundSchema,
    errors: ["PLAYGROUND_NOT_FOUND"],
    status: "defined",
  },
  "playground.create": {
    group: "library",
    summary: "从模板创建项目；名称缺省时取“模板标识加序号”",
    params: z.object({
      template: z.string().min(1),
      name: name.optional(),
      note: z.string().optional(),
      autoClean: autoCleanDays.optional(),
      vars: z.record(z.string().min(1), z.string()).optional().describe("模板变量"),
      ifExists: z.enum(["reuse", "fail"]).optional(),
      createdBy: createdBySchema,
    }),
    result: z.object({ playground: playgroundSchema, created: z.boolean() }),
    errors: [
      "NAME_INVALID",
      "NAME_RESERVED",
      "NAME_EXISTS",
      "TEMPLATE_NOT_FOUND",
      "TEMPLATE_INVALID",
      "VAR_INVALID",
      "DATA_FROM_NEWER_VERSION",
    ],
    status: "defined",
  },
  "playground.rename": {
    group: "library",
    summary: "改名；正在运行的先停止、改名、再用新名称启动",
    params: z.object({ playground: playgroundRefSchema, newName: name }),
    result: playgroundSchema,
    errors: [
      "PLAYGROUND_NOT_FOUND",
      "FOLDER_MISSING",
      "NAME_INVALID",
      "NAME_RESERVED",
      "NAME_EXISTS",
      "BUSY",
      "PATH_LOCKED",
      "DATA_FROM_NEWER_VERSION",
    ],
    status: "defined",
  },
  "playground.update": {
    group: "library",
    summary: "改备注、自动清理（null 关闭）、脚本保存后自动运行",
    params: z.object({
      playground: playgroundRefSchema,
      note: z.string().optional(),
      autoClean: autoCleanDays.nullable().optional(),
      scriptAutoRun: z.boolean().optional(),
    }),
    result: playgroundSchema,
    errors: ["PLAYGROUND_NOT_FOUND", "DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
  "playground.duplicate": {
    group: "library",
    summary: "复制一个项目，得到新 id 和新端口",
    params: z.object({ playground: playgroundRefSchema, name: name.optional() }),
    result: playgroundSchema,
    errors: [
      "PLAYGROUND_NOT_FOUND",
      "FOLDER_MISSING",
      "NAME_INVALID",
      "NAME_RESERVED",
      "NAME_EXISTS",
      "DATA_FROM_NEWER_VERSION",
    ],
    status: "defined",
  },
  "playground.trash": {
    group: "library",
    summary: "先停止，再走释放顺序，只通过平台层移到废纸篓；放不进就失败，不做永久删除",
    params: z.object({ playground: playgroundRefSchema }),
    result: z.object({
      trashed: z.boolean(),
      deletedRegenerable: z.array(z.string()).describe("为省空间直接删掉的可再生目录（相对路径）"),
    }),
    errors: [
      "PLAYGROUND_NOT_FOUND",
      "FOLDER_MISSING",
      "PATH_LOCKED",
      "PATH_TOO_LONG",
      "TRASH_UNAVAILABLE",
      "DATA_FROM_NEWER_VERSION",
    ],
    status: "defined",
  },
  "playground.relocate": {
    group: "library",
    summary: "重新定位找不到的项目：指向任意位置的文件夹，只要里面的 id 对得上",
    params: z.object({ playground: playgroundRefSchema, path: z.string().min(1) }),
    result: playgroundSchema,
    errors: ["PLAYGROUND_NOT_FOUND", "DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
  "playground.forget": {
    group: "library",
    summary: "从资源库移除，不动磁盘",
    params: z.object({ playground: playgroundRefSchema }),
    result: emptySchema,
    errors: ["PLAYGROUND_NOT_FOUND", "DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
  "playground.released": {
    group: "library",
    summary: "客户端回报“我已释放这个项目的句柄”，回应 playground.releaseRequested",
    params: z.object({ playgroundId: z.string().min(1) }),
    result: emptySchema,
    errors: [],
    status: "defined",
  },
  "library.rescan": {
    group: "library",
    summary: "重新扫描资源库根目录",
    params: emptySchema,
    result: emptySchema,
    errors: ["DATA_FROM_NEWER_VERSION"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
