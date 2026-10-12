import { z } from "zod";
import {
  failureReasonSchema,
  portFallbackReasonSchema,
  runKindSchema,
  runStateSchema,
} from "./enums.ts";
import { ownerSchema } from "./owner.ts";
import { logCursorSchema, portSchema, timestampSchema } from "./primitives.ts";

// 端口被占用时本次改用别的端口的说明（规格 RUN-PORTS-06；技术设计 §5.3）。
// 占用者查不到时没有 occupant
export const portOccupantSchema = z.object({
  pid: z.number().int().nonnegative(),
  name: z.string(),
});
export type PortOccupant = z.infer<typeof portOccupantSchema>;

export const portFallbackSchema = z.object({
  wanted: portSchema,
  reason: portFallbackReasonSchema,
  occupant: portOccupantSchema.optional(),
});
export type PortFallback = z.infer<typeof portFallbackSchema>;

export const runIdSchema = z.string().min(1);

// 一次运行此刻的样子（docs/architecture/protocol-methods.md 第 1 节；技术设计 §4.3、§5.3）。
// reason 只带失败的错误码；参数和原始现场在启动请求的错误响应与日志里
export const runSnapshotSchema = z
  .object({
    runId: runIdSchema,
    playgroundId: z.string().min(1),
    name: z.string().min(1),
    kind: runKindSchema,
    state: runStateSchema,
    reason: failureReasonSchema.optional(),
    stale: z.boolean().optional().describe("脚本：语法错误，保留上次输出"),
    owner: ownerSchema,
    port: portSchema.optional(),
    url: z
      .string()
      .startsWith("http://127.0.0.1:")
      .optional()
      .describe("字面量 127.0.0.1，不写 localhost"),
    portFallback: portFallbackSchema.optional(),
    pid: z.number().int().nonnegative().optional(),
    exitCode: z.number().int().optional(),
    startedAt: timestampSchema,
    readyMs: z.number().nonnegative().optional(),
    durationMs: z.number().nonnegative().optional(),
    idleStopAt: timestampSchema.optional().describe("只有命令行持有的运行有"),
    slow: z
      .boolean()
      .optional()
      .describe("starting 超过 30 秒仍未就绪：状态不变，只标较慢（RUN-LIFECYCLE-10）"),
    cursor: logCursorSchema.describe("当前日志末尾的游标"),
    alreadyRunning: z.boolean().optional().describe("对活动中的项目再次启动时为 true"),
  })
  .meta({ id: "RunSnapshot" });
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;
