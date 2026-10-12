import { z } from "zod";
import { defineFileFormat } from "./file-format.ts";
import { installCommandSchema, officialUrlSchema } from "./install-hint.ts";
import { localizedTextSchema } from "./localized-text.ts";
import { relativePathSchema } from "./primitives.ts";

// template.json（规格 templates/format；技术设计 §4.4、§6.8；PRD #prd-template-engineering）。
// 模板是数据：没有命令，没有钩子，只通过 runner 引用一个运行器。
// 这里只定形状；需要看文件夹内容的规则（entry-missing、variable-undeclared）在 validate-template-files.ts，
// 其余规则（name-missing-en、path-escape、range-*、tool-unknown 等）在 validate-template.ts。

export const TEMPLATE_FORMAT_VERSION = 1;

// 模板和运行器的标识：小写字母、数字、连字符，首尾不是连字符（规格 TEMPLATES-FORMAT-07）
export const templateIdPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
export const templateIdSchema = z
  .string()
  .regex(templateIdPattern, "lowercase letters, digits and hyphens; no hyphen at either end");

// 分类是固定的标识，文字在应用的文案里（技术设计 §6.8 列了页面、前端、全栈、脚本、服务、我的）。
// 标识本身该文档没写，这里定为下面六个
export const templateCategories = [
  "page",
  "frontend",
  "fullstack",
  "script",
  "service",
  "mine",
] as const;
export const templateCategorySchema = z.enum(templateCategories);
export type TemplateCategory = z.infer<typeof templateCategorySchema>;

// 标签也是固定的标识。规格目前只规定了 unmaintained（TEMPLATES-FORMAT-54）
export const templateTags = ["unmaintained"] as const;
export const templateTagSchema = z.enum(templateTags);
export type TemplateTag = z.infer<typeof templateTagSchema>;

// 工具标识：node、pnpm、python、uv、go 等，必须是工具定义里有的（或自己写 install）
export const toolIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, "lowercase tool id");

// 模板自己写的安装方式，只展示（规格 TEMPLATES-FORMAT-36）。至少给命令或链接之一
export const templateInstallSchema = z
  .strictObject({ command: installCommandSchema.optional(), url: officialUrlSchema.optional() })
  .refine((install) => install.command !== undefined || install.url !== undefined, {
    message: "give a command, a url, or both",
  });

export const toolRequirementSchema = z.strictObject({
  version: z.string().min(1).describe("版本范围：空格分隔的比较式，必须有下限，如 >=22.18 <27"),
  fallback: toolIdSchema.optional().describe("缺少时改用的另一个工具，如 pnpm 缺则 npm"),
  install: templateInstallSchema.optional(),
});
export type ToolRequirement = z.infer<typeof toolRequirementSchema>;

// 不依赖任何工具的模板写空对象，表示“无”（规格 TEMPLATES-FORMAT-27）
export const requiresSchema = z.record(toolIdSchema, toolRequirementSchema);
export type Requires = z.infer<typeof requiresSchema>;

// 变量名：字母、数字、下划线，不以数字开头；{{name}} 由项目名自动提供，不必声明
export const variableNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const templateSchema = z.strictObject({
  formatVersion: z.literal(TEMPLATE_FORMAT_VERSION),
  id: templateIdSchema.describe("命令行里的模板名"),
  name: localizedTextSchema,
  description: localizedTextSchema,
  category: templateCategorySchema,
  runner: templateIdSchema.describe("运行器标识"),
  requires: requiresSchema,
  entry: relativePathSchema.describe("入口文件，相对 files/，用 / 分隔"),
  tags: z.array(templateTagSchema).optional(),
  variables: z
    .record(z.string().regex(variableNamePattern), z.string())
    .optional()
    .describe("变量名到默认值"),
  substitute: z.array(relativePathSchema).optional().describe("做 {{变量}} 字面替换的文件"),
  maintainer: z.string().min(1).optional().describe("具名维护者；内置模板必须有"),
});
export type Template = z.infer<typeof templateSchema>;

// 坏了的模板只是这一个不可用，其余照常（recovery: skip）
export const templateFileFormat = defineFileFormat({
  name: "template.json",
  currentVersion: TEMPLATE_FORMAT_VERSION,
  schema: templateSchema,
  migrations: {},
  recovery: "skip",
});
