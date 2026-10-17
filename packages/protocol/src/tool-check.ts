import { z } from "zod";
import { envSourceSchema, toolStatusSchema } from "./enums.ts";

// 一个工具的检测结果（规格 TOOLCHAIN-DETECTION-02、04、05、08、09）。
// 只有执行版本命令并解析出版本号才算 found。
// 版本高于上限仍是 found，带 untested（照常运行，不是错误）。
// 安装方式（工具定义里当前系统的 install，模板自己写的优先）作为可选字段随结果返回，只展示、从不执行（#228）。
export const toolCheckSchema = z.object({
  tool: z.string().min(1).describe("工具标识，由模板的工具定义决定，是开放集合"),
  status: toolStatusSchema,
  path: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  required: z.string().optional().describe("模板要求的版本范围"),
  untested: z.boolean().optional().describe("版本高于要求的上限"),
  source: envSourceSchema.optional().describe("这次检测用的环境从哪里来"),
  arch: z
    .string()
    .min(1)
    .optional()
    .describe("找到的可执行文件的芯片架构（arm64、x64、universal）；读不出来不写"),
  installCommand: z
    .string()
    .min(1)
    .optional()
    .describe("缺失或过旧时当前系统的安装命令，给人看的一行，只复制不执行"),
  installUrl: z.string().min(1).optional().describe("官网或安装说明，只放 https 地址"),
});
export type ToolCheck = z.infer<typeof toolCheckSchema>;

export const toolchainReportSchema = z.object({ tools: z.array(toolCheckSchema) });
export type ToolchainReport = z.infer<typeof toolchainReportSchema>;
