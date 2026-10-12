import { z } from "zod";

// 运行的持有者（PRD #prd-run-ownership；技术设计 §5.1）。
// tab 绑定到应用的某个标签页；cli 不绑定任何连接。请求里的 tab 持有者由主进程补上。
export const tabOwnerSchema = z.object({
  kind: z.literal("tab"),
  clientId: z.string().min(1),
  tabId: z.string().min(1),
});
export const cliOwnerSchema = z.object({
  kind: z.literal("cli"),
  agent: z.string().min(1).optional(),
  command: z.string(),
});
// meta.id 让参考文档把它当作一个有名字的共用类型，不在每处展开
export const ownerSchema = z
  .discriminatedUnion("kind", [tabOwnerSchema, cliOwnerSchema])
  .meta({ id: "Owner" });
export type Owner = z.infer<typeof ownerSchema>;
