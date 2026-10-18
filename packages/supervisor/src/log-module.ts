import { supervisorLogDir } from "@runyard/platform";
import type { RunState } from "@runyard/protocol";
import type { HandlerMap } from "./dispatch.ts";
import { createLogHandlers } from "./log-handlers.ts";
import { RunLogService } from "./run-log-service.ts";
import type { RunObserver } from "./run-module.ts";
import type { Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 日志的装配（#43）：给运行编排一个 `RunObserver.log`，给方法分发 logs.read|follow|clear。
// 用法见 run-main.ts：observer 传给 createRunModule，handlers 并进它的 handlers，onShutdown 里等 flush。

export interface LogModuleOptions {
  playgroundOf(runId: string): string | undefined;
  stateOf(playgroundId: string): RunState | undefined;
  /** 命令行读或跟随了这个项目的日志（空闲停止把它算作活动） */
  onMention?(playgroundId: string, session: Session): void;
}

export interface LogModule {
  readonly service: RunLogService;
  readonly observer: Required<Pick<RunObserver, "log" | "state">>;
  readonly handlers: HandlerMap;
  flush(): Promise<void>;
}

export function createLogModule(api: SupervisorApi, options: LogModuleOptions): LogModule {
  const service = new RunLogService({
    platform: api.platform,
    // 运行日志和管理进程日志同在 logs/ 下
    dir: supervisorLogDir(api.platform.paths.stateDir),
    playgroundOf: options.playgroundOf,
    stateOf: options.stateOf,
  });
  return {
    service,
    observer: {
      log: (runId, entry) => service.record(runId, entry),
      state: (event) => service.beginRun(event.run.runId),
    },
    handlers: createLogHandlers(api, service, options.onMention),
    flush: () => service.flush(),
  };
}
