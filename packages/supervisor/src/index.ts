// 包的唯一入口：其他包只从 @runyard/supervisor 导入
import { fileURLToPath } from "node:url";

export {
  createPlatformDiscoveryStore,
  type DiscoveryStore,
  discoveryFilePath,
} from "./discovery-file.ts";
export {
  type HandlerMap,
  HandlerOutcome,
  type MethodHandler,
  type RequestContext,
} from "./dispatch.ts";
export type { LibrarySeams } from "./library-seams.ts";
export { MethodFailure, methodFailure } from "./method-failure.ts";
export { parseSupervisorArgs, type SupervisorArgs } from "./parse-args.ts";
export { RELEASE_TIMEOUT_MS } from "./release-coordinator.ts";
export { STOP_WAIT_LIMIT_MS } from "./run-control.ts";
export { EXIT_ALREADY_RUNNING_LINE, runSupervisorMain } from "./run-main.ts";
export {
  BYE_STOP_WAIT_MS,
  createRunModule,
  type RunModule,
  type RunModuleOptions,
  type RunObserver,
} from "./run-module.ts";
export { DISCONNECT_GRACE_MS } from "./run-owners.ts";
export { noRuns, type RunsView } from "./runs-view.ts";
export type { Session, SessionCloseReason, SessionInfo } from "./session.ts";
export {
  createSettingsStore,
  defaultSettings,
  type SettingsStore,
  settingsFilePath,
} from "./settings-store.ts";
export { startSupervisor } from "./start-supervisor.ts";
export type { SupervisorApi } from "./supervisor-api.ts";
export { createSystemClock, type SupervisorClock } from "./supervisor-clock.ts";
export {
  HANDSHAKE_TIMEOUT_MS,
  IDLE_EXIT_MS,
  MAX_PENDING_EVENT_BYTES,
  type SessionObserver,
  SHUTDOWN_GRACE_MS,
  type StartSupervisorOptions,
  type SupervisorExtensions,
  type SupervisorHandle,
  type SupervisorIdentity,
  type TemplateDataDirs,
} from "./supervisor-options.ts";
export { createToolchainStore, type ToolchainStore, toolchainFilePath } from "./toolchain-store.ts";

/** 入口文件的绝对路径，供启动者（client，#44）拼命令行；打包后的位置由打包步骤另行决定 */
export function supervisorEntryPath(): string {
  return fileURLToPath(new URL("./main.ts", import.meta.url));
}
