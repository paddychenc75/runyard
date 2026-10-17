import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { absPath, getPlatform } from "@runyard/platform";
import { app } from "electron";
import { killTerminal } from "../terminal/kill-terminal.ts";
import { TerminalService, type TerminalServiceOptions } from "../terminal/terminal-service.ts";
import { OutputCollector, runTerminalSmoke } from "../terminal/terminal-smoke.ts";
import { launchPtyHost } from "./pty-host-process.ts";

// 终端服务的 Electron 接线：pty-host 的模块路径、随应用安装的 runyard 启动脚本目录、清理用的平台层。

/** 随应用安装的 runyard 启动脚本所在目录（Contents/Resources/bin）；从源码运行时没有 */
export function runyardBinDir(): string | undefined {
  return app.isPackaged ? join(process.resourcesPath, "bin") : undefined;
}

export function createTerminalService(input: {
  root: string | undefined;
  distDir: string;
  folderOf: TerminalServiceOptions["folderOf"];
  emit: TerminalServiceOptions["emit"];
}): TerminalService {
  const platform = getPlatform(input.root === undefined ? {} : { home: absPath(input.root) });
  const binDir = runyardBinDir();
  return new TerminalService({
    launch: () => launchPtyHost(join(input.distDir, "pty-host", "index.cjs")),
    folderOf: input.folderOf,
    emit: input.emit,
    killTerminal: (target) => killTerminal(platform, target),
    ...(binDir === undefined ? {} : { runyardBinDir: binDir }),
  });
}

/** --terminal-smoke：不开窗口、不连管理进程；返回进程退出码 */
export async function runTerminalSmokeFlow(input: {
  root: string | undefined;
  distDir: string;
  log: (line: string) => void;
  hold: boolean;
}): Promise<number> {
  const collector = new OutputCollector();
  const folder = realpathSync(mkdtempSync(join(input.root ?? tmpdir(), "terminal-smoke-")));
  const service = createTerminalService({
    root: input.root,
    distDir: input.distDir,
    folderOf: () => folder,
    emit: (event, payload) => {
      if (event === "terminal.data") collector.push(payload as { project: string; data: string });
    },
  });
  const platform = getPlatform(input.root === undefined ? {} : { home: absPath(input.root) });
  const binDir = runyardBinDir();
  return await runTerminalSmoke({
    service,
    collector,
    folder,
    identity: (pid) => platform.proc.identity(pid),
    expectRunyard: binDir === undefined ? null : { binDir },
    log: input.log,
    hold: input.hold,
  });
}
