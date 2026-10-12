import { z } from "zod";
import { waitModeSchema } from "./enums.ts";
import type { MethodDefinition } from "./method-definition.ts";
import { ownerSchema, tabOwnerSchema } from "./owner.ts";
import { emptySchema, playgroundRefSchema, portSchema } from "./primitives.ts";
import { runIdSchema, runSnapshotSchema } from "./run-snapshot.ts";

// 运行组（规格 run/lifecycle、run/ownership、run/ports、run/scripts）。
// run.disown 只占名字，见 methods-reserved.ts。

// 停止、重启等按“运行 id 或项目”指定：恰好给其中一个
const runTarget = z
  .object({ runId: runIdSchema.optional(), playground: playgroundRefSchema.optional() })
  .refine((target) => (target.runId === undefined) !== (target.playground === undefined), {
    message: "give exactly one of runId and playground",
  });

const startErrors = [
  "PLAYGROUND_NOT_FOUND",
  "FOLDER_MISSING",
  "TOOL_MISSING",
  "TOOL_TOO_OLD",
  "RUNTIME_MISSING",
  "SETUP_FAILED",
  "DEPS_OFFLINE",
  "RUN_FAILED",
  "SCRIPT_ERRORED",
  "READY_TIMEOUT",
  // run.start / run.restart 会写 library.json（记住的端口、lastUsedAt）
  "DATA_FROM_NEWER_VERSION",
] as const;

const clientAndRun = z.object({ runId: runIdSchema, clientId: z.string().min(1) });

export const runMethods = {
  "run.start": {
    group: "run",
    summary: "启动一个项目；对活动中的项目返回现有运行并带 alreadyRunning",
    params: z.object({
      playground: playgroundRefSchema,
      owner: ownerSchema,
      wait: waitModeSchema.describe("none 立即返回；ready 等就绪；exit 等退出"),
      timeoutMs: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("只决定本次调用何时返回，不杀进程"),
      port: portSchema.optional().describe("只用于本次"),
    }),
    result: runSnapshotSchema,
    errors: startErrors,
    status: "defined",
  },
  "run.stop": {
    group: "run",
    summary: "停止整棵进程树；返回时进程树已空、端口已释放。runId 和 playground 恰好给一个",
    params: runTarget,
    result: runSnapshotSchema,
    errors: ["PLAYGROUND_NOT_FOUND", "RUN_NOT_FOUND"],
    status: "defined",
  },
  "run.stopAll": {
    group: "run",
    summary: "停止全部运行；带 mine 时只停命令行持有的",
    params: z.object({ mine: z.boolean().optional() }),
    result: z.object({ stopped: z.array(runIdSchema) }),
    errors: [],
    status: "defined",
  },
  "run.restart": {
    group: "run",
    summary: "先停止再启动，端口不变",
    params: z.object({ playground: playgroundRefSchema }),
    result: runSnapshotSchema,
    errors: startErrors,
    status: "defined",
  },
  "run.get": {
    group: "run",
    summary: "取一次运行",
    params: z.object({ runId: runIdSchema }),
    result: runSnapshotSchema,
    errors: ["RUN_NOT_FOUND"],
    status: "defined",
  },
  "run.list": {
    group: "run",
    summary: "列出运行",
    params: z.object({ running: z.boolean().optional().describe("只要仍计入“运行中”的") }),
    result: z.array(runSnapshotSchema),
    errors: [],
    status: "defined",
  },
  "run.adopt": {
    group: "run",
    summary: "“改为由我管理”：持有者从命令行改为这个标签页",
    params: z.object({ runId: runIdSchema, owner: tabOwnerSchema }),
    result: runSnapshotSchema,
    errors: ["RUN_NOT_FOUND"],
    status: "defined",
  },
  "run.attach": {
    group: "run",
    summary: "“查看”：不改持有者，不算空闲活动",
    params: clientAndRun,
    result: emptySchema,
    errors: ["RUN_NOT_FOUND"],
    status: "defined",
  },
  "run.detach": {
    group: "run",
    summary: "结束“查看”",
    params: clientAndRun,
    result: emptySchema,
    errors: ["RUN_NOT_FOUND"],
    status: "defined",
  },
  "run.stdin": {
    group: "run",
    summary: "向 running 的脚本写标准输入，原样写入，不补换行；服务不接收",
    params: z.object({
      runId: runIdSchema,
      data: z.string().describe("原样写入进程的标准输入，不自动补换行"),
    }),
    result: emptySchema,
    errors: ["RUN_NOT_FOUND", "NOT_SUPPORTED"],
    status: "defined",
  },
} as const satisfies Record<string, MethodDefinition>;
