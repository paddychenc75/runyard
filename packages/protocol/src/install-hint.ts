import { z } from "zod";

// 安装提示的两种来源共用的片段：工具定义里的各系统安装方式（tool-definition.ts），
// 和模板 requires 里自己写的 install（template-file.ts）。
// 应用只展示这些命令，从不执行（规格 TEMPLATES-FORMAT-36、TEMPLATES-CUSTOM-21），
// 所以命令是给人看的参数数组，不经过 shell 的规则（那条只管运行器）。

export const installCommandSchema = z.array(z.string().min(1)).min(1);

export const officialUrlSchema = z
  .string()
  .regex(/^https:\/\/\S+$/, "must be an https URL")
  .describe("官网链接，安装提示里始终一起给出");
