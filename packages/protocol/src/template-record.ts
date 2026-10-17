import { z } from "zod";
import { runKindSchema } from "./enums.ts";
import { lintRuleSchema } from "./lint-issue.ts";
import { localizedTextSchema } from "./localized-text.ts";
import { relativePathSchema } from "./primitives.ts";
import { runnerCommandSchema, runnerReadySchema } from "./runner-file.ts";
import {
  requiresSchema,
  templateCategorySchema,
  templateTagSchema,
  toolIdSchema,
} from "./template-file.ts";

// template.list / template.get 返回的模板记录（规格 cli/commands 的 template list 一条）。
// name、description 原样带着模板里的值（字符串或语言到文字），不随命令行语言挑选。
// 无效的用户模板也在列表里（valid: false，规格 TEMPLATES-CUSTOM-17 至 22）：
// 读不出的字段取缺省值（category 取 mine、tags 为空），不让一个坏模板把整张列表弄坏。

export const templateSources = ["builtin", "user"] as const;
export const templateSourceSchema = z.enum(templateSources);
export type TemplateSource = z.infer<typeof templateSourceSchema>;

export const templateRecordSchema = z
  .object({
    id: z.string().min(1).describe("模板标识；无效模板读不出时取文件夹名"),
    name: localizedTextSchema,
    description: localizedTextSchema,
    category: templateCategorySchema,
    tags: z.array(templateTagSchema),
    source: templateSourceSchema,
    runner: z.string().describe("运行器标识；读不出时为空串"),
    kind: runKindSchema.nullable().describe("运行器的类别；运行器不存在或无效时为 null"),
    requires: requiresSchema,
    valid: z.boolean(),
  })
  .meta({ id: "TemplateRecord" });
export type TemplateRecord = z.infer<typeof templateRecordSchema>;

// 模板详情要给人看的运行方式：运行器里的安装命令（按包管理器）、启动命令、就绪判断。
// 只是展示用的摘要，不是运行器本身；运行器找不到或无效时整个字段是 null
export const templateRunnerSummarySchema = z.object({
  setup: z
    .record(toolIdSchema, runnerCommandSchema)
    .describe("按包管理器区分的安装命令；没有安装步骤时为空"),
  run: runnerCommandSchema.nullable().describe("启动命令；运行器没有时为 null"),
  ready: runnerReadySchema.nullable(),
});
export type TemplateRunnerSummary = z.infer<typeof templateRunnerSummarySchema>;

// template.get 的出参：记录加上文件夹位置和模板里的文件；
// problems 是 lint 报的错误（模板有效时为空），桌面应用的模板页用它写“无效的原因”；
// 只带规则和路径：lint 的 message 是给开发者看的英文，方法的出参里不放面向用户的文字
export const templateDetailSchema = z.object({
  template: templateRecordSchema,
  path: z.string().min(1).describe("模板文件夹的绝对路径"),
  files: z.array(relativePathSchema).describe("模板里文件的相对路径，用 / 分隔"),
  runner: templateRunnerSummarySchema.nullable(),
  problems: z.array(z.object({ rule: lintRuleSchema, path: z.string() })),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;
