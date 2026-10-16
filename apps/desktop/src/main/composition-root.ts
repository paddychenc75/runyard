import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { clientError, connectSupervisor, type RunyardClient } from "@runyard/client";
import { absPath, getPlatform } from "@runyard/platform";
import pkg from "../../package.json" with { type: "json" };
import type { LibraryClient } from "./library-controller.ts";

// 组合根：把真的东西接到桌面应用上。和命令行的组合根（packages/cli/src/composition-root.ts）一样，
// 管理进程入口文件的位置是这里唯一注入的配置值；打包后的位置等打包 issue 定，现在只有从源码运行的路径。

/**
 * 启动管理进程的命令前缀。应用里的 Node 就是 Electron 自己（ELECTRON_RUN_AS_NODE），
 * 入口是仓库里的 TypeScript 源文件（Node 24 直接运行）。
 * moduleUrl 是主进程入口文件的地址：构建产物在 apps/desktop/dist/main/，往上四层是仓库根。
 */
export function developmentSupervisorCommand(moduleUrl: string): string[] {
  const entry = new URL("../../../../packages/supervisor/src/main.ts", moduleUrl);
  return [process.execPath, fileURLToPath(entry)];
}

export interface Connected {
  client: RunyardClient;
  /** 本应用实例的连接标识，标签页持有者用它绑定到这条连接 */
  clientId: string;
}

/** 连接（必要时拉起）管理进程；root 缺省用真实主目录，开发和测试时一定要传临时目录 */
export async function connectToSupervisor(
  moduleUrl: string,
  root: string | undefined,
): Promise<Connected> {
  const platform = getPlatform(root === undefined ? {} : { home: absPath(root) });
  const client = await connectSupervisor({
    platform,
    client: { kind: "app", version: pkg.version, build: "source" },
    launch: {
      command: developmentSupervisorCommand(moduleUrl),
      host: "electron",
      // 子进程的环境是原样给的，不继承本进程：只带运行 Node 所需的两项
      env: { ELECTRON_RUN_AS_NODE: "1", ...(process.env.PATH ? { PATH: process.env.PATH } : {}) },
    },
  });
  return { client, clientId: randomUUID() };
}

/** 连不上管理进程时窗口照样打开，列表区显示这个错误；每个调用都以同一个错误失败 */
export function unavailableClient(cause: unknown): LibraryClient {
  const fail = async (): Promise<never> => {
    throw clientError("SUPERVISOR_UNAVAILABLE", {}, `not connected: ${String(cause)}`);
  };
  return { call: fail, subscribe: fail, followLogs: fail };
}
