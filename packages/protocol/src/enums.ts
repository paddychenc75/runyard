import { z } from "zod";

// 枚举值用小驼峰风格的小写词（技术设计 §5.1 表）；文案键 runState.<值> 由它们推出。
// 登记后不改名、不复用，只许新增（见包的 AGENTS.md）。

// 运行状态（技术设计 §4.3，docs/architecture/run-state-machine.md 第 1 节）
export const runStates = [
  "checking",
  "installing",
  "starting",
  "ready",
  "reloading",
  "running",
  "stopping",
  "stopped",
  "finished",
  "errored",
  "crashed",
  "failed",
] as const;
export const runStateSchema = z.enum(runStates);
export type RunState = z.infer<typeof runStateSchema>;

// 登录环境的来源（技术设计 §7.1、决策记录 0009）
export const envSources = ["login-shell", "login-shell-degraded", "path-only", "fallback"] as const;
export const envSourceSchema = z.enum(envSources);
export type EnvSource = z.infer<typeof envSourceSchema>;

// 运行进入 failed 时的原因：取自错误码，与错误码是同一批代码（技术设计 §4.3、§4.4）
export const failureReasons = [
  "TOOL_MISSING",
  "TOOL_TOO_OLD",
  "SETUP_FAILED",
  "DEPS_OFFLINE",
  "RUN_FAILED",
  "RUNTIME_MISSING",
] as const;
export const failureReasonSchema = z.enum(failureReasons);
export type FailureReason = z.infer<typeof failureReasonSchema>;

// 端口回退的原因。PORT_RESERVED 只在这里出现，不是错误码（技术设计 §5.3）
export const portFallbackReasons = ["PORT_OCCUPIED", "PORT_RESERVED"] as const;
export const portFallbackReasonSchema = z.enum(portFallbackReasons);
export type PortFallbackReason = z.infer<typeof portFallbackReasonSchema>;

// 运行的种类（技术设计 §4.3、§5.3 示例）：server 服务，static 页面，oneshot 脚本。
// 脚本没有端口和地址（规格 RUN-PORTS-03）
export const runKinds = ["server", "static", "oneshot"] as const;
export const runKindSchema = z.enum(runKinds);
export type RunKind = z.infer<typeof runKindSchema>;

// 一个工具的检测结论（规格 TOOLCHAIN-DETECTION-02、04、05、08）：
// unknown 表示只读缓存（cachedOnly）而缓存里没有，不是没找到
export const toolStatuses = ["found", "missing", "too-old", "unknown"] as const;
export const toolStatusSchema = z.enum(toolStatuses);
export type ToolStatus = z.infer<typeof toolStatusSchema>;

// run.start 的 wait：none 立即返回；ready 等就绪；exit 等退出
export const waitModes = ["none", "ready", "exit"] as const;
export const waitModeSchema = z.enum(waitModes);
export type WaitMode = z.infer<typeof waitModeSchema>;

// supervisor.shutdown 的原因（技术设计 §5.2）
export const shutdownReasons = ["upgrade", "install", "user"] as const;
export const shutdownReasonSchema = z.enum(shutdownReasons);
export type ShutdownReason = z.infer<typeof shutdownReasonSchema>;

// 事件按“主题”订阅，主题是事件名第一个点之前的部分。run.log 不在 run 主题里：
// 它量大且属于某个项目，只经 logs.follow 订阅（protocol-methods.md 第 3 节）
export const eventTopics = ["playground", "run", "toolchain", "settings"] as const;
export const eventTopicSchema = z.enum(eventTopics);
export type EventTopic = z.infer<typeof eventTopicSchema>;
