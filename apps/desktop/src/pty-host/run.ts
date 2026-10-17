import { accessSync, constants, statSync } from "node:fs";
import { createRequire } from "node:module";
import { userInfo } from "node:os";
import { dirname } from "node:path";
import { getPlatform } from "@runyard/platform";
import { type HostCommand, type HostEvent, parseHostCommand } from "../shared/pty-host-messages.ts";
import type { ShellFailure } from "../shared/terminal.ts";
import { ensureSpawnHelperExecutable } from "./ensure-spawn-helper.ts";
import { type HostDeps, PtyHost, type PtyLike } from "./host.ts";
import { watchParent } from "./watch-parent.ts";

// pty-host 的真接线：node-pty、平台层、父进程监视。消息的收发方式（utilityProcess 的 parentPort，
// 或者测试里的标准输入输出）由调用方传进来。

export interface HostTransport {
  send(event: HostEvent): void;
  onCommand(listener: (command: HostCommand) => void): void;
  /** 收尾完成、可以退出了 */
  exit(): void;
}

/** 系统用户记录里的登录 shell（不看环境变量，访达启动的应用没有 SHELL） */
export function userRecordShell(): string | undefined {
  try {
    const shell = userInfo().shell;
    return shell === undefined || shell === null || shell === "" ? undefined : shell;
  } catch {
    return undefined;
  }
}

export function checkShellFile(path: string): "ok" | ShellFailure {
  try {
    if (!statSync(path).isFile()) return "not-executable";
    accessSync(path, constants.X_OK);
    return "ok";
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "not-found" : "not-executable";
  }
}

const WATCH_INTERVAL_MS = 1000;

/** 真的依赖：node-pty、平台层、用户记录里的 shell。测试可以覆盖其中几项（比如指定一个不存在的登录 shell） */
export function createHostDeps(
  send: (event: HostEvent) => void,
  overrides: Partial<HostDeps> = {},
): HostDeps {
  const require = createRequire(import.meta.url);
  const nodePty = require("node-pty") as typeof import("node-pty");
  ensureSpawnHelperExecutable(dirname(require.resolve("node-pty/package.json")));
  return {
    spawn: (file, args, o): PtyLike =>
      nodePty.spawn(file, args, {
        name: "xterm-256color",
        cols: o.cols,
        rows: o.rows,
        cwd: o.cwd,
        env: o.env,
        encoding: "utf8",
      }),
    send,
    proc: getPlatform().proc,
    loginShell: async () => userRecordShell(),
    checkShell: async (path) => checkShellFile(path),
    baseEnv: process.env,
    earlyExitMs: 600,
    graceMs: 1000,
    ...overrides,
  };
}

export async function runPtyHost(
  transport: HostTransport,
  options: { parentPid: number } = { parentPid: process.ppid },
): Promise<PtyHost> {
  const platform = getPlatform();
  const host = new PtyHost(createHostDeps((event) => transport.send(event)));
  transport.onCommand((command) => host.handle(command));
  await watchParent({
    parentPid: options.parentPid,
    identity: (pid) => platform.proc.identity(pid),
    intervalMs: WATCH_INTERVAL_MS,
    onGone: () => void host.dispose().finally(() => transport.exit()),
  });
  transport.send({ type: "ready" });
  return host;
}

export { parseHostCommand };
