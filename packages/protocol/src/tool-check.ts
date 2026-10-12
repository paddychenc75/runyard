import { z } from "zod";
import { envSourceSchema, toolStatusSchema } from "./enums.ts";

// 一个工具的检测结果（规格 TOOLCHAIN-DETECTION-02、04、05、08、09）。
// 只有执行版本命令并解析出版本号才算 found。
// 版本高于上限仍是 found，带 untested（照常运行，不是错误）。
// 安装命令怎样随结果返回还没定（protocol-methods.md 未定第 4 条），这里不放。
export const toolCheckSchema = z.object({
  tool: z.string().min(1).describe("工具标识，由模板的工具定义决定，是开放集合"),
  status: toolStatusSchema,
  path: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  required: z.string().optional().describe("模板要求的版本范围"),
  untested: z.boolean().optional().describe("版本高于要求的上限"),
  source: envSourceSchema.optional().describe("这次检测用的环境从哪里来"),
});
export type ToolCheck = z.infer<typeof toolCheckSchema>;

export const toolchainReportSchema = z.object({ tools: z.array(toolCheckSchema) });
export type ToolchainReport = z.infer<typeof toolchainReportSchema>;
