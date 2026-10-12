import { z } from "zod";

// 运行的持有者（PRD #prd-run-ownership；技术设计 §5.1）。
// tab 绑定到应用的某个标签页；cli 不绑定任何连接。请求里的 tab 持有者由主进程补上。
export const ownerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tab"), clientId: z.string().min(1), tabId: z.string().min(1) }),
  z.object({ kind: z.literal("cli"), agent: z.string().min(1).optional(), command: z.string() }),
]);
export type Owner = z.infer<typeof ownerSchema>;
