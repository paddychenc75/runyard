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
