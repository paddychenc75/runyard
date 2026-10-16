import { absPath } from "@runyard/platform";
import { createCrashRecovery } from "./crash-recovery.ts";
import { createIdleStop } from "./idle-stop.ts";
import { createLogModule } from "./log-module.ts";
import { createRunModule, type RunModule, type RunModuleOptions } from "./run-module.ts";
import { combineObservers } from "./run-observers.ts";
import type { SupervisorApi } from "./supervisor-api.ts";
import type { SupervisorExtensions } from "./supervisor-options.ts";

// 入口把各块接在一起的地方：运行编排（#40）、日志（#43）、空闲停止与崩溃后清理（#42）。
// 单独放在这里是为了让入口和测试用同一份装配，不各写一遍。

export interface ComposeOptions {
  readonly templateData: RunModuleOptions["templateData"];
  readonly appVersion: string;
  /** 给开发者看的英文诊断行 */
  readonly log: (line: string) => void;
  /** 运行编排的其余选项（测试换准备阶段、就绪探测、加自己的观察者） */
  readonly run?: Partial<Omit<RunModuleOptions, "templateData" | "appVersion">>;
}

export interface Composition {
  readonly extensions: SupervisorExtensions;
  readonly run: RunModule;
  readonly logs: ReturnType<typeof createLogModule>;
  readonly idle: ReturnType<typeof createIdleStop>;
}

export function composeExtensions(api: SupervisorApi, options: ComposeOptions): Composition {
  // 日志、空闲停止、崩溃清理都要问引擎，引擎在运行模块里，所以互相引用，都只在回调里用
  const idle = createIdleStop(api, {
    runOf: (runId) => run.engine.get(runId),
    folderOf: async (playgroundId) => {
      const item = (await api.openLibrary()).find(playgroundId);
      return item === undefined ? undefined : absPath(item.entry.path);
    },
  });
  const logs = createLogModule(api, {
    playgroundOf: (runId) => run.engine.get(runId)?.request.playgroundId,
    stateOf: (playgroundId) => run.engine.current(playgroundId)?.state,
    onMention: (playgroundId, session) => {
      idle.mentionPlayground(playgroundId, session);
      run.scriptWatch.mention(playgroundId, session);
    },
  });
  const recovery = createCrashRecovery(api, {
    restore: (input) => void run.engine.restoreCrashed(input),
    nameOf: async (playgroundId) => (await api.openLibrary()).find(playgroundId)?.name,
    log: options.log,
  });
  const run = createRunModule(api, {
    ...options.run,
    templateData: options.templateData,
    appVersion: options.appVersion,
    idleStopAt: idle.idleStopAt,
    observer: combineObservers(
      logs.observer,
      idle.observer,
      recovery.observer,
      options.run?.observer ?? {},
    ),
  });
  const extensions: SupervisorExtensions = {
    ...run,
    handlers: { ...run.handlers, ...logs.handlers },
    recoverCrashedRuns: recovery.recover,
    // 运行停完之后最后几行日志和记录的删除才到，所以落盘排在它后面
    onShutdown: async (reason) => {
      idle.dispose();
      await run.onShutdown(reason);
      await recovery.flush();
      await logs.flush();
    },
  };
  return { extensions, run, logs, idle };
}
