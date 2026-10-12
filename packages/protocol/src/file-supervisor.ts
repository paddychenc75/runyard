import { z } from "zod";
import { runStateSchema } from "./enums.ts";
import { defineFileFormat } from "./file-format.ts";
import { ownerSchema } from "./owner.ts";
import { playgroundSchema } from "./playground.ts";
import { portSchema, timestampSchema } from "./primitives.ts";
import { protocolVersionSchema } from "./protocol-version.ts";
import { runIdSchema } from "./run-snapshot.ts";

// ~/.runyard/run/ 下的两种文件（storage.md 2.4）。都是整个重写、不做读改写，
// 所以未知字段不保留（默认的 strip）：这两个文件只在一台机器、一个管理进程生命周期内有意义。

export const SUPERVISOR_FILE_VERSION = 1;

// 握手口令：32 字节随机数，小写十六进制（协议文档第 2 节）
export const supervisorTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

// 谁拉起的管理进程。字段名 host 和值沿用存储文档；不是 supervisor.info 的 startedBy（app / cli）
export const supervisorHosts = ["electron", "node"] as const;

// 发现文件 supervisor.json（权限 600，先写临时文件再改名；这些由 platform 和 supervisor 做）
export const supervisorFileSchema = z.object({
  formatVersion: z.literal(SUPERVISOR_FILE_VERSION),
  pid: z.number().int().positive(),
  startedAt: timestampSchema,
  endpoint: z.string().min(1).describe("连接点：socket 路径（以后是命名管道名）"),
  token: supervisorTokenSchema,
  protocol: protocolVersionSchema,
  minClientProtocol: protocolVersionSchema,
  version: z.string().min(1).describe("产品版本"),
  // 版本号加构建时的随机串（决策记录 0007 第 6 条）。原地替换应用后路径还在，
  // 靠它判断管理进程是不是旧的
  build: z.string().min(1).describe("构建标识"),
  host: z.enum(supervisorHosts),
  execPath: z.string().min(1).describe("启动者的可执行文件路径"),
});
export type SupervisorFile = z.infer<typeof supervisorFileSchema>;

// 发现文件坏了按“没有发现文件”处理（客户端去启动管理进程，规格 PROTOCOL-HANDSHAKE-03）
export const supervisorFileFormat = defineFileFormat({
  name: "supervisor.json",
  currentVersion: SUPERVISOR_FILE_VERSION,
  schema: supervisorFileSchema,
  migrations: {},
  recovery: "discard",
});

// doctor --bundle 打包前去掉口令
export function redactSupervisorFile(file: SupervisorFile): Omit<SupervisorFile, "token"> {
  const { token: _token, ...rest } = file;
  return rest;
}

export const RUN_RECORD_VERSION = 1;

// runs/<runId>.json：只为崩溃后清理。下次启动逐个核对 pid 加 processStart，
// 都一致且仍活着的整棵结束并标 crashed；不一致的绝不结束（规格 SUPERVISOR-LIFECYCLE 的崩溃清理）。
// 规格只要求标 crashed，不要求重启后还能说出失败原因，所以这里不存失败参数
export const runRecordSchema = z.object({
  formatVersion: z.literal(RUN_RECORD_VERSION),
  runId: runIdSchema,
  playgroundId: playgroundSchema.shape.id,
  owner: ownerSchema,
  pid: z.number().int().positive(),
  processStart: z
    .number()
    .int()
    .nonnegative()
    .describe("操作系统给出的进程启动时间，platform 的 identity().startTime 原样"),
  cwd: z.string().min(1),
  port: portSchema.optional().describe("脚本没有"),
  command: z.array(z.string()).min(1).describe("参数数组，不经过 shell"),
  startedAt: timestampSchema,
  state: runStateSchema,
  // 运行标记（决策记录 0006，Windows 以后必须）。第一版 macOS 不用，先留位置
  marker: z.string().min(1).optional(),
});
export type RunRecord = z.infer<typeof runRecordSchema>;

// 单个运行记录坏了：跳过它，不影响别的记录；对应进程没法核对身份，所以不结束任何东西
export const runRecordFormat = defineFileFormat({
  name: "run record",
  currentVersion: RUN_RECORD_VERSION,
  schema: runRecordSchema,
  migrations: {},
  recovery: "skip",
});
