import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientError, connectSupervisor, type RunyardClient } from "@runyard/client";
import { absPath, getPlatform } from "@runyard/platform";
import pkg from "../../package.json" with { type: "json" };
import type { LibraryClient } from "./library-controller.ts";
import { ReconnectingClient } from "./reconnecting-client.ts";

// 组合根：把真的东西接到桌面应用上。和命令行的组合根（packages/cli/src/composition-root.ts）一样，
// 管理进程入口文件的位置是这里唯一注入的配置值：从源码运行时在仓库里，打包后在应用的资源目录里（#194）。

/** 应用从哪里运行：源码（pnpm dev）或打好的包；两种情况下管理进程入口和版本的来源不同 */
export type DesktopRuntime =
  | { kind: "source"; moduleUrl: string }
  | { kind: "packaged"; resourcesPath: string };

/** 打包时写进资源目录 runyard/manifest.json 的内容（apps/desktop/packaging/runtime-bundle.ts） */
export interface RuntimeManifest {
  version: string;
  build: string;
}

/**
 * 启动管理进程的命令前缀。应用里的 Node 就是 Electron 自己（ELECTRON_RUN_AS_NODE）。
 * 源码：入口是仓库里的 TypeScript 源文件（Node 24 直接运行）；moduleUrl 是主进程入口文件的地址，
 * 构建产物在 apps/desktop/dist/main/，往上四层是仓库根。
 */
export function developmentSupervisorCommand(moduleUrl: string): string[] {
  const entry = new URL("../../../../packages/supervisor/src/main.ts", moduleUrl);
  return [process.execPath, fileURLToPath(entry)];
}

/** 打包后：管理进程是资源目录里打好的单个文件，与命令行（cli.mjs）同一份产物 */
export function packagedSupervisorCommand(resourcesPath: string): string[] {
  return [process.execPath, join(resourcesPath, "runyard", "supervisor.mjs")];
}

/** 客户端自报的版本和构建标识：包里取清单（与命令行一致），源码是 package.json 加固定的 "source" */
export function clientIdentity(
  runtime: DesktopRuntime,
  readManifest: (resourcesPath: string) => RuntimeManifest = readPackagedManifest,
): { version: string; build: string } {
  if (runtime.kind === "source") return { version: pkg.version, build: "source" };
  const manifest = readManifest(runtime.resourcesPath);
  return { version: manifest.version, build: manifest.build };
}

export function readPackagedManifest(resourcesPath: string): RuntimeManifest {
  return JSON.parse(
    readFileSync(join(resourcesPath, "runyard", "manifest.json"), "utf8"),
  ) as RuntimeManifest;
}

export interface Connected {
  client: RunyardClient;
  /** 本应用实例的连接标识，标签页持有者用它绑定到这条连接 */
  clientId: string;
}

/** 连接（必要时拉起）管理进程；root 缺省用真实主目录，开发和测试时一定要传临时目录 */
export async function connectToSupervisor(
  runtime: DesktopRuntime,
  root: string | undefined,
): Promise<Connected> {
  const platform = getPlatform(root === undefined ? {} : { home: absPath(root) });
  const client = await connectSupervisor({
    platform,
    client: { kind: "app", ...clientIdentity(runtime) },
    launch: {
      command:
        runtime.kind === "source"
          ? developmentSupervisorCommand(runtime.moduleUrl)
          : packagedSupervisorCommand(runtime.resourcesPath),
      host: "electron",
      // 子进程的环境是原样给的，不继承本进程：只带运行 Node 所需的两项
      env: { ELECTRON_RUN_AS_NODE: "1", ...(process.env.PATH ? { PATH: process.env.PATH } : {}) },
    },
  });
  return { client, clientId: randomUUID() };
}

/**
 * 在已连上的连接外包一层：管理进程被换掉、重启后自己重连并重新订阅（#358）；
 * 连上之后让它重扫一遍资源库，再调 refresh 重读状态
 */
export function withReconnect(
  connected: Connected,
  runtime: DesktopRuntime,
  root: string | undefined,
  refresh: () => Promise<void>,
): ReconnectingClient {
  const wrapper: ReconnectingClient = new ReconnectingClient(connected.client, {
    connect: async () => (await connectToSupervisor(runtime, root)).client,
    onReconnected: async () => {
      await wrapper.call("library.rescan", {}).catch(() => undefined);
      await refresh();
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  return wrapper;
}

/** 连不上管理进程时窗口照样打开，列表区显示这个错误；每个调用都以同一个错误失败 */
export function unavailableClient(cause: unknown): LibraryClient {
  const fail = async (): Promise<never> => {
    throw clientError("SUPERVISOR_UNAVAILABLE", {}, `not connected: ${String(cause)}`);
  };
  return { call: fail, subscribe: fail, followLogs: fail };
}
