import { z } from "zod";
import type { MethodDefinition } from "./method-definition.ts";
import { emptySchema, playgroundRefSchema, relativePathSchema } from "./primitives.ts";
import { templateDetailSchema, templateRecordSchema } from "./template-record.ts";

// 模板组（规格 templates/format、templates/custom；docs/architecture/protocol-methods.md 第 2 节）。
// template lint 和 template test 在命令行进程里直接跑，不经管理进程，所以没有方法。
// 规格没有固定入参出参的字段名，本组的名字是本包选的，PR 里列给协调人。

export const templateMethods = {
  "template.list": {
    group: "template",
    summary: "列出内置模板和用户模板；无效的用户模板也在，valid 为 false",
    params: emptySchema,
    result: z.array(templateRecordSchema),
    errors: [],
    status: "defined",
  },
  "template.get": {
    group: "template",
    summary: "取一个模板的记录、位置和里面的文件",
    params: z.object({ id: z.string().min(1) }),
    result: templateDetailSchema,
    errors: ["TEMPLATE_NOT_FOUND"],
    status: "defined",
  },
  "template.save": {
    group: "template",
    summary: "把项目另存为用户模板；先写临时目录再改名，失败不留残片",
    params: z.object({
      playground: playgroundRefSchema,
      // 入参只要求非空：标识写法不对要回规格要求的 NAME_INVALID，不是 schema 先拒绝的 USAGE
      // （同 methods-library.ts 里的名称）；写法由处理函数按 templateIdSchema 校验
      as: z.string().min(1).describe("新模板的标识；小写字母、数字、连字符，首尾不是连字符"),
      name: z.string().min(1).optional().describe("缺省时取标识"),
      description: z.string().optional().describe("缺省时为空"),
      replaceName: z.boolean().optional().describe("把进入模板的文本文件里的项目名换成 {{name}}"),
      include: z.array(relativePathSchema).optional().describe("把默认不进模板的文件加进来"),
      exclude: z.array(relativePathSchema).optional().describe("去掉默认会进模板的文件"),
    }),
    result: z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      path: z.string().min(1).describe("模板文件夹的绝对路径"),
      files: z.array(relativePathSchema),
      source: z.literal("user"),
    }),
    errors: ["PLAYGROUND_NOT_FOUND", "FOLDER_MISSING", "NAME_INVALID", "NAME_EXISTS"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
