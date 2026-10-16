import { randomBytes as cryptoRandomBytes } from "node:crypto";
import type { Server, Socket } from "node:net";
import { joinPath, posixRelPath } from "@runyard/platform";
import type { EventData, EventName, ShutdownReason } from "@runyard/protocol";
import { NONCE_BYTES, SUPERVISOR_FILE_VERSION } from "@runyard/protocol";
import { createBuiltinHandlers } from "./builtin-methods.ts";
import { createPlatformDiscoveryStore } from "./discovery-file.ts";
import { createDispatcher, type HandlerMap } from "./dispatch.ts";
import { ServerHandshake } from "./handshake-server.ts";
import { createIdleMonitor } from "./idle-monitor.ts";
import { createLibraryContext } from "./library-context.ts";
import { createLibraryHandlers } from "./library-handlers.ts";
import { createLibraryService } from "./library-service.ts";
import { createSessionManager } from "./session-manager.ts";
import type { SupervisorApi } from "./supervisor-api.ts";
import { createSystemClock } from "./supervisor-clock.ts";
import {
  HANDSHAKE_TIMEOUT_MS,
  IDLE_EXIT_MS,
  MAX_PENDING_EVENT_BYTES,
  SHUTDOWN_GRACE_MS,
  type StartSupervisorOptions,
  type SupervisorExtensions,
} from "./supervisor-options.ts";
import { createTemplateHandlers } from "./template-handlers.ts";
import { createTemplateLibrary } from "./template-library.ts";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

function mergeHandlers(builtin: HandlerMap, extra: HandlerMap | undefined): HandlerMap {
  for (const name of Object.keys(extra ?? {})) {
    if (Object.hasOwn(builtin, name)) {
      throw new Error(`method ${name} is provided by the supervisor itself and cannot be replaced`);
    }
  }
  return { ...builtin, ...extra };
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) resolve();
    else server.close(() => resolve());
  });
}

// 把会话、分发、空闲计时、发现文件接在一起。还没有监听：监听（拿锁）由 startSupervisor 先做，
// 拿到服务器之后才 bootstrap。
export function createSupervisorRuntime(options: StartSupervisorOptions) {
  const { platform, identity } = options;
  const clock = options.clock ?? createSystemClock();
  const log = options.log ?? (() => {});
  const store = options.discovery ?? createPlatformDiscoveryStore(platform);
  const random = options.randomBytes ?? ((n: number) => cryptoRandomBytes(n));
  const tokenBytes = random(32);
  const token = hex(tokenBytes);
  let extensions: SupervisorExtensions = {};
  let server: Server | undefined;
  let shutdownPromise: Promise<void> | undefined;
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const runCount = () => extensions.runCount?.() ?? 0;

  const idle = createIdleMonitor({
    clock,
    idleMs: options.idleExitMs ?? IDLE_EXIT_MS,
    isIdle: () => manager.count() === 0 && runCount() === 0,
    onIdle: () => void api.shutdown("user"),
  });

  let dispatch: ReturnType<typeof createDispatcher> | undefined;
  let library!: ReturnType<typeof createLibraryContext>;
  const manager = createSessionManager({
    clock,
    handshakeTimeoutMs: options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
    maxPendingEventBytes: options.maxPendingEventBytes ?? MAX_PENDING_EVENT_BYTES,
    supervisor: {
      protocol: identity.protocol,
      minProtocol: identity.minClientProtocol,
      build: identity.build,
    },
    newHandshake: () =>
      new ServerHandshake({
        token: tokenBytes,
        ipc: platform.ipc,
        protocol: identity.protocol,
        minProtocol: identity.minClientProtocol,
        build: identity.build,
        newNonce: () => hex(random(NONCE_BYTES)),
      }),
    handle: async (session, request) => {
      if (dispatch === undefined) throw new Error("supervisor is not started");
      return dispatch(session, request);
    },
    onReady: (session) => extensions.sessions?.onReady?.(session),
    onClosed: (session, reason) => {
      // 断开的连接不会再回报释放，别让改名白等
      library.release.sessionClosed(session.id);
      extensions.sessions?.onClosed?.(session, reason);
    },
    onCountChanged: () => idle.evaluate(),
  });

  const api: SupervisorApi = {
    platform,
    clock,
    publish: <E extends EventName>(event: E, data: EventData<E>) => manager.publish(event, data),
    notifyRunsChanged: () => idle.evaluate(),
    readySessions: () => manager.ready(),
    openLibrary: async () => (await library.open()).library,
    readSettings: () => library.settings.get(),
    shutdown(reason: ShutdownReason) {
      shutdownPromise ??= (async () => {
        idle.stop();
        try {
          await extensions.onShutdown?.(reason);
        } catch (error) {
          log(`onShutdown failed: ${String(error)}`);
        }
        // 先删发现文件：之后再来的客户端不会拿到一个马上要失效的口令
        await store
          .remove()
          .catch((error) => log(`removing discovery file failed: ${String(error)}`));
        // server.close 要等所有连接都关了才完成，所以先发起（不再接受新连接），连接收完之后再等它
        const serverClosed = server === undefined ? Promise.resolve() : closeServer(server);
        await manager.closeAll(options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS);
        await serverClosed;
        resolveClosed();
      })();
      return shutdownPromise;
    },
  };

  library = createLibraryContext(api, () => extensions.library ?? {}, log);
  const libraryService = createLibraryService(library);
  // 用户模板在状态目录下的 templates/（storage.md 第 1 节）
  const templates = createTemplateLibrary(platform, {
    ...options.templateData,
    userDir: joinPath(platform.paths.stateDir, posixRelPath("templates")),
  });

  // 顺序见 start-supervisor.ts 开头的说明
  async function bootstrap(listening: Server): Promise<void> {
    server = listening;
    // 先挂上：没有口令的人握手必败，有口令的人要等发现文件写好才拿得到
    listening.on("connection", (socket: Socket) => manager.accept(socket));
    listening.on("error", (error) => log(`server error: ${String(error)}`));
    extensions = options.extend?.(api) ?? {};
    const builtin = createBuiltinHandlers({
      identity,
      runCount,
      onBye: async (sessionId) => {
        const session = manager.ready().find((candidate) => candidate.id === sessionId);
        if (session !== undefined) await extensions.sessions?.onBye?.(session);
      },
    });
    const own = {
      ...builtin,
      ...createLibraryHandlers(library, libraryService),
      ...createTemplateHandlers(library, templates),
    };
    dispatch = createDispatcher(mergeHandlers(own, extensions.handlers), api);
    await store.remove();
    try {
      await extensions.recoverCrashedRuns?.();
    } catch (error) {
      // 清理失败不能让管理进程起不来：起不来比留下一个孤儿进程更糟，错误进日志
      log(`crash recovery failed: ${String(error)}`);
    }
    // 取不到启动时间就不写，读的一方退回只比 pid
    const self = await platform.proc.identity(process.pid);
    await store.write({
      formatVersion: SUPERVISOR_FILE_VERSION,
      pid: process.pid,
      ...(self === null ? {} : { processStart: self.startTime }),
      startedAt: clock.now(),
      endpoint: platform.ipc.endpoint(),
      token,
      protocol: identity.protocol,
      minClientProtocol: identity.minClientProtocol,
      version: identity.version,
      build: identity.build,
      host: options.host,
      execPath: options.execPath,
    });
    idle.evaluate();
    // 启动时扫描资源库（规格 LIBRARY-PLAYGROUNDS-26 到 30）；不挡着接受连接，失败只记日志
    void libraryService.start();
  }

  return {
    api,
    token,
    closed,
    bootstrap,
    abort: () => idle.stop(),
    connectionCount: () => manager.count(),
  };
}
