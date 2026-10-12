// 包的唯一入口：其他包只从 @runyard/platform 导入
export { getPlatform, platformFor } from "./get-platform.ts";
export { type AbsPath, absPath, joinPath, type PosixRelPath, posixRelPath } from "./path-types.ts";
export { MAX_NAME_LENGTH } from "./paths/validate-name.ts";
export type {
  Arch,
  Disposable,
  Env,
  EnvFailureReason,
  EnvLoadResult,
  ExitInfo,
  LengthVerdict,
  ManagedProcess,
  NameProblem,
  Platform,
  PlatformId,
  PortStatus,
  ProcRef,
  ShellInfo,
  TerminateMode,
  ToolCandidate,
  ToolId,
  TrashResult,
  WatchEvent,
  WatchOptions,
} from "./platform.ts";
export { isPlatformError, PlatformError, platformError } from "./platform-error.ts";
export type { PlatformOptions } from "./platform-options.ts";
export { discoveryFilePath, supervisorLogDir, supervisorLogPath } from "./state-files.ts";
