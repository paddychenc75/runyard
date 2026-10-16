import { rm } from "node:fs/promises";
import {
  createPortSlotAllocator,
  createReadinessProbe,
  createRunPreparer,
  DEFAULT_PORT_RANGE,
  type InstallHint,
  isActiveState,
  type ReadinessProbe,
  type Run,
  RunEngine,
  type RunExitEvent,
  type RunPreparer,
  type RunStateEvent,
  readToolDefinitions,
  ScriptRuns,
  type StartRequest,
  type StaticServer,
  ToolchainService,
} from "@runyard/core";
import { joinPath, posixRelPath } from "@runyard/platform";
import type { FailureReason, LogEntry, Owner, RunyardError, Settings } from "@runyard/protocol";
import { TOOLCHAIN_FILE_VERSION } from "@runyard/protocol";
import { RunControl, STOP_WAIT_LIMIT_MS } from "./run-control.ts";
import { createRunHandlers, RunViewers } from "./run-handlers.ts";
import { OwnerBindings } from "./run-owners.ts";
import { createRunSubjects } from "./run-subjects.ts";
import type { RunsView } from "./runs-view.ts";
import type { Session } from "./session.ts";
import { createStaticServer } from "./static-server.ts";
import type { SupervisorApi } from "./supervisor-api.ts";
import type { SupervisorExtensions, TemplateDataDirs } from "./supervisor-options.ts";
import { createTemplateCatalog } from "./template-catalog.ts";
import { createToolchainStore } from "./toolchain-store.ts";

// 运行编排的装配（#40）：把 core 的运行引擎、脚本重跑、准备阶段接到管理进程上，
// 给出方法处理函数、“N 个运行中”、资源库用的 RunsView，以及持有者随连接生灭的规则。
// 用法：`startSupervisor({ extend: (api) => createRunModule(api, { templateData }) })`，
// 其他接缝（崩溃后清理、空闲停止、日志）由各自的 issue 合并进同一个 extend 的返回值。

/** 正常退出（session.bye）时，最多等多久把这条连接名下的运行停完（规格 RUN-OWNERSHIP-06） */
export const BYE_STOP_WAIT_MS = 5000;

/** 给其他 issue 看运行的缝：空闲停止（#42）、日志落盘（#43）都从这里接 */
export interface RunObserver {
  /** 一个命令提到了这次运行（start、stop、restart、get、stdin）；session 为 undefined 表示管理进程自己 */
  mentioned?(run: Run, session: Session | undefined): void;
  state?(event: RunStateEvent): void;
  exit?(event: RunExitEvent): void;
  /** 运行产生的每一条日志（含系统提示），run.log 事件只经 logs.follow 推送 */
  log?(runId: string, entry: LogEntry): void;
}

export interface RunModuleOptions {
  /**
   * 给了内置模板的位置（builtinDir）才接上模板展开和端口槽位（创建项目用）；
   * 缺省时创建任何模板都是 TEMPLATE_NOT_FOUND，由调用方自己用 `library` 接缝补
   */
  readonly templateData: Pick<TemplateDataDirs, "runnersDir" | "toolsDir"> &
    Partial<Pick<TemplateDataDirs, "builtinDir">>;
  /** 写进新项目的 template.appVersion */
  readonly appVersion?: string;
  readonly observer?: RunObserver;
  /** 以下几项缺省是真实实现；测试换成替身 */
  readonly preparer?: RunPreparer;
  readonly readiness?: ReadinessProbe;
  /** `static` 运行器的页面服务；缺省是管理进程自己的实现 */
  readonly serveStatic?: StaticServer;
  readonly disconnectGraceMs?: number;
  readonly byeWaitMs?: number;
  readonly stopWaitLimitMs?: number;
}

export interface RunModule extends Required<Omit<SupervisorExtensions, "recoverCrashedRuns">> {
  readonly engine: RunEngine;
  readonly runs: RunsView;
  readonly viewers: RunViewers;
  /** 工具检测服务（懒创建：要先读工具定义）；工具链方法也该用这一个 */
  toolchain(): Promise<ToolchainService>;
  /** 失败之后给用户的安装提示（只是数据，不执行任何命令） */
  installHintFor(
    request: StartRequest,
    failure: RunyardError<FailureReason>,
  ): Promise<InstallHint | undefined>;
}

function once<T>(make: () => Promise<T>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => {
    value ??= make();
    return value;
  };
}

export function createRunModule(api: SupervisorApi, options: RunModuleOptions): RunModule {
  const { platform, clock } = api;
  const observer = options.observer ?? {};
  const subjects = createRunSubjects(api, options.templateData.runnersDir);
  let settings: Settings | undefined;
  const refreshSettings = async () => {
    settings = await api.readSettings();
  };

  // 工具定义要先从磁盘读，所以工具检测服务和准备阶段都在第一次用到时才创建
  const tools = once(async () => {
    const definitions = await readToolDefinitions(platform, options.templateData.toolsDir);
    const store = createToolchainStore({ platform, now: () => clock.now() });
    const cached = await store.load();
    const toolchain = new ToolchainService({
      platform,
      clock,
      definitions,
      toolPaths: () => settings?.toolPaths ?? {},
      onChanged: () => api.publish("toolchain.changed", {}),
      ...(cached === undefined
        ? {}
        : { initialCache: { formatVersion: TOOLCHAIN_FILE_VERSION, entries: cached } }),
      onCacheChange: (file) => void store.save(file.entries).catch(() => undefined),
    });
    const preparer = createRunPreparer({
      platform,
      clock,
      toolchain,
      resolve: subjects.subjectOf,
      definitions,
      portRange: () => settings?.ports ?? DEFAULT_PORT_RANGE,
      serveStatic: options.serveStatic ?? createStaticServer({ platform }),
    });
    return { toolchain, preparer };
  });
  const preparer: RunPreparer = options.preparer ?? {
    prepare: async (context) => (await tools()).preparer.prepare(context),
  };

  let counter = 0;
  const engine = new RunEngine({
    platform,
    clock,
    preparer,
    readiness: options.readiness ?? createReadinessProbe({ clock }),
    // delete-allow: Go 运行的单独临时目录（状态目录下 tmp/<runId>），是管理进程自己建的，不是用户的内容
    removeDir: (dir) => rm(dir, { recursive: true, force: true }),
    // 管理进程重启后序号会重来，所以带上时间：运行 id 同时是运行标记和日志文件名的一部分
    newRunId: () => `run-${clock.now().toString(36)}-${(++counter).toString(36)}`,
    sinks: {
      state: (event) => {
        api.publish("run.state", event);
        api.notifyRunsChanged();
        observer.state?.(event);
      },
      log: (runId, entry) => observer.log?.(runId, entry),
      exit: (event) => {
        api.publish("run.exit", event);
        observer.exit?.(event);
      },
      port: (event) => api.publish("run.port", event),
    },
  });

  const scripts = new ScriptRuns({
    platform,
    clock,
    engine,
    toolchain: { check: async (request) => (await tools()).toolchain.check(request) },
    resolve: subjects.subjectOf,
    autoRunEnabled: async (playgroundId) => {
      const { file } = await subjects.lookup(playgroundId);
      return (settings?.scriptAutoRun ?? true) && (file.script?.autoRun ?? true);
    },
  });

  const mentioned = (run: Run, session: Session | undefined) => observer.mentioned?.(run, session);
  // control 在 owners 的到期回调里要用，owners 又是 control 的依赖
  const owners = new OwnerBindings({
    clock,
    ...(options.disconnectGraceMs === undefined ? {} : { graceMs: options.disconnectGraceMs }),
    onExpire: (clientId) => void control.stopTabRunsOf(clientId),
  });
  const control = new RunControl({
    api,
    engine,
    scripts,
    subjects,
    owners,
    refreshSettings,
    mentioned,
    stopWaitLimitMs: options.stopWaitLimitMs ?? STOP_WAIT_LIMIT_MS,
  });
  const viewers = new RunViewers();

  const currentActive = (playgroundId: string): Run | undefined => {
    const run = engine.current(playgroundId);
    return run !== undefined && isActiveState(run.state) ? run : undefined;
  };

  // 模板展开与端口槽位（创建项目）。创建时的版本检测尽力而为：检测不到不挡创建
  const { builtinDir } = options.templateData;
  const templates =
    builtinDir === undefined
      ? undefined
      : createTemplateCatalog({
          platform,
          locations: {
            builtinDir,
            userDir: joinPath(platform.paths.stateDir, posixRelPath("templates")),
            runnersDir: options.templateData.runnersDir,
            toolsDir: options.templateData.toolsDir,
          },
          appVersion: options.appVersion ?? "0.0.0",
          detectVersions: async (requires) => {
            try {
              const { toolchain } = await tools();
              const checked = await toolchain.check({ requires });
              return Object.fromEntries(
                checked.tools.flatMap((tool) =>
                  tool.version === undefined ? [] : [[tool.tool, tool.version]],
                ),
              );
            } catch {
              return {};
            }
          },
        });
  const catalog = templates && {
    ...templates,
    // 端口范围是设置里的，每次创建前现读（规格 RUN-PORTS-04）
    seed: async (request: Parameters<typeof templates.seed>[0]) => {
      await refreshSettings();
      return templates.seed(request);
    },
  };

  const runs: RunsView = {
    activePlaygrounds: () =>
      new Set(
        engine
          .list()
          .flatMap((run) => (isActiveState(run.state) ? [run.request.playgroundId] : [])),
      ),
    isBusy: (id) => {
      const state = currentActive(id)?.state;
      return state === "installing" || state === "starting";
    },
    ownerOf: (id) => currentActive(id)?.snapshot().owner,
    stop: async (id) => {
      await currentActive(id)?.stop();
    },
    start: async (id, owner: Owner) => {
      await control.start({ ref: id, owner, wait: "none" });
    },
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      clock.setTimeout(resolve, ms);
    });

  return {
    engine,
    runs,
    viewers,
    toolchain: async () => (await tools()).toolchain,
    installHintFor: async (request, failure) =>
      (await tools()).preparer.installHintFor(request, failure),
    handlers: createRunHandlers({ api, control, owners, viewers, mentioned }),
    runCount: () => engine.runningCount(),
    library: {
      runs,
      ...(catalog === undefined
        ? {}
        : {
            templates: catalog,
            ports: createPortSlotAllocator({
              range: () => settings?.ports ?? DEFAULT_PORT_RANGE,
              runnerKind: catalog.runnerKind,
            }),
          }),
    },
    onShutdown: async () => {
      owners.dispose();
      await engine.stopAll();
    },
    sessions: {
      onReady: (session) => owners.sessionReady(session),
      onClosed: (session, reason) => {
        // bye 已经停完并放开了它名下的 clientId；shutdown 由 onShutdown 统一停
        if (reason === "bye" || reason === "shutdown") return;
        owners.sessionLost(session.id);
      },
      onBye: async (session) => {
        const clients = owners.clientsOf(session.id);
        const stopping = Promise.all(clients.map((clientId) => control.stopTabRunsOf(clientId)));
        // 最多等 5 秒；没停完的继续停，不拦着应用退出
        await Promise.race([stopping, wait(options.byeWaitMs ?? BYE_STOP_WAIT_MS)]);
        for (const clientId of clients) owners.release(clientId);
      },
    },
  };
}
