import { z } from "zod";

// 项目的创建者（docs/architecture/storage.md 2.1；规格 LIBRARY-PLAYGROUNDS-02）。
// 和运行的持有者（Owner）是两回事：持有者只描述一次运行，创建者写进项目自己的元数据。
export const createdByKinds = ["user", "agent", "cli"] as const;
export const createdBySchema = z.object({
  kind: z.enum(createdByKinds),
  agent: z.string().min(1).optional(),
  command: z.string().optional(),
});
export type CreatedBy = z.infer<typeof createdBySchema>;
