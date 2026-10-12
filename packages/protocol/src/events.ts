import { z } from "zod";
import {
  type EventTopic,
  failureReasonSchema,
  portFallbackReasonSchema,
  runStateSchema,
} from "./enums.ts";
import { logEntrySchema } from "./log-entry.ts";
import { playgroundSchema } from "./playground.ts";
import { emptySchema, portSchema, timestampSchema } from "./primitives.ts";
import { portOccupantSchema, runIdSchema, runSnapshotSchema } from "./run-snapshot.ts";

// 事件的数据定义（技术设计 §5.2；docs/architecture/protocol-methods.md 第 3 节）。
// 事件帧是 { t: 'evt', sub, seq, event, data }，data 的形状从这里取。

export interface EventDefinition {
  summary: string;
  data: z.ZodType;
  // 经哪种订阅收到：events.subscribe 的主题、logs.follow，或 null（还没有人能订阅）
  topic: EventTopic | "logs.follow" | null;
  status: "defined" | "reserved";
}

const playgroundIdOnly = z.object({ playgroundId: z.string().min(1) });
const anything = z.unknown();

export const eventRegistry = {
  "playground.added": {
    summary: "资源库里多了一个项目",
    data: playgroundSchema,
    topic: "playground",
    status: "defined",
  },
  "playground.changed": {
    summary: "项目的记录变了（含按 id 认回、改了路径）",
    data: playgroundSchema,
    topic: "playground",
    status: "defined",
  },
  "playground.removed": {
    summary: "项目从资源库移除（移到废纸篓或忘记）",
    data: playgroundIdOnly,
    topic: "playground",
    status: "defined",
  },
  "playground.missing": {
    summary: "找不到项目的文件夹；记录里带 missingSince",
    data: playgroundSchema,
    topic: "playground",
    status: "defined",
  },
  "playground.releaseRequested": {
    summary: "管理进程请所有客户端释放这个项目的句柄，最多等 3 秒；释放后调 playground.released",
    data: playgroundIdOnly.extend({ reason: z.enum(["rename", "trash"]) }),
    topic: "playground",
    status: "defined",
  },
  "run.state": {
    summary: "运行的状态变了；runningCount 由管理进程算，界面不自己数",
    data: z.object({
      run: runSnapshotSchema,
      previous: runStateSchema.optional().describe("上一个状态；第一个状态没有"),
      at: timestampSchema,
      runningCount: z.number().int().nonnegative().describe("“N 个运行中”"),
    }),
    topic: "run",
    status: "defined",
  },
  "run.log": {
    summary: "日志里多了一条；只经 logs.follow 的订阅推送",
    data: logEntrySchema,
    topic: "logs.follow",
    status: "defined",
  },
  "run.exit": {
    summary: "运行的进程退出；reason 为 idle 表示命令行持有的运行空闲后被停止",
    data: z.object({
      runId: runIdSchema,
      exitCode: z.number().int().optional(),
      reason: z.union([failureReasonSchema, z.literal("idle")]).optional(),
    }),
    topic: "run",
    status: "defined",
  },
  "run.port": {
    summary: "登记的端口被占用或被系统保留，本次改用别的端口",
    data: z.object({
      runId: runIdSchema,
      wanted: portSchema,
      actual: portSchema,
      occupant: portOccupantSchema.optional(),
      reason: portFallbackReasonSchema,
    }),
    topic: "run",
    status: "defined",
  },
  "toolchain.changed": {
    summary: "工具检测结果变了（后台刷新完成）；不带数据，客户端用 toolchain.check 重读",
    data: emptySchema,
    topic: "toolchain",
    status: "defined",
  },
  "settings.changed": {
    summary: "设置变了；不带数据，客户端用 settings.get 重读",
    data: emptySchema,
    topic: "settings",
    status: "defined",
  },
  "request.result": {
    summary: "请求面板的结果（M3）",
    data: anything,
    topic: null,
    status: "reserved",
  },
  "agent.activity": {
    summary: "智能体活动（以后）",
    data: anything,
    topic: null,
    status: "reserved",
  },
  "supervisor.closing": {
    summary: "管理进程即将退出（以后）",
    data: anything,
    topic: null,
    status: "reserved",
  },
} as const satisfies Record<string, EventDefinition>;

export type EventName = keyof typeof eventRegistry;
export type EventData<E extends EventName> = z.infer<(typeof eventRegistry)[E]["data"]>;

export const eventNames = Object.keys(eventRegistry) as EventName[];

export function isEventName(name: string): name is EventName {
  return Object.hasOwn(eventRegistry, name);
}
