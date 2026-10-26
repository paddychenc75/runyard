import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { absPath, getPlatform } from "@runyard/platform";
import { type BrowserWindow, dialog, shell } from "electron";
import { type CliHost, CliSettings } from "../cli-settings.ts";
import { clientIdentity, type DesktopRuntime } from "../composition-root.ts";
import type { LibraryClient } from "../library-controller.ts";
import { ToolchainSettings } from "../toolchain-settings.ts";
import {
  cliLauncherPath,
  defaultCliBinDir,
  installCliLink,
  readCliLink,
  uninstallCliLink,
} from "./cli-link.ts";
import { runBundledCli } from "./run-bundled-cli.ts";
import { skillGuidePath } from "./skill-guide.ts";

// 设置页里“依赖与网络、运行环境、命令行与智能体”要的系统动作的接线：文件选择器、终端、访达、随包命令行的运行。
// 这些在自动化测试里看不到真的发生，逻辑都在 toolchain-settings.ts、cli-settings.ts 里用假的宿主测，这里只做薄薄的转接。

export interface SystemSettingsOptions {
  client: Pick<LibraryClient, "call" | "subscribe">;
  runtime: DesktopRuntime;
  /** 主目录（--root 或真实的）；技能包、命令行链接、.npmrc 都在它下面 */
  home: string;
  window: BrowserWindow;
  dialogWindow?: () => BrowserWindow;
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

/** AppleScript 字符串里的反斜杠和双引号 */
const appleScriptText = (text: string): string => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** 随包命令行的入口：源码运行时是仓库里的，打包后在资源目录里（与管理进程的入口同一套规则） */
function cliEntry(runtime: DesktopRuntime): string {
  return runtime.kind === "source"
    ? fileURLToPath(new URL("../../../../packages/cli/src/main.ts", runtime.moduleUrl))
    : join(runtime.resourcesPath, "runyard", "cli.mjs");
}

export function createSystemSettings(options: SystemSettingsOptions): {
  toolchain: ToolchainSettings;
  cli: CliSettings;
} {
  const { client, runtime, home, window } = options;
  const platform = getPlatform({ home: absPath(home) });
  const toolchain = new ToolchainSettings(client, {
    chooseExecutable: async () => {
      const picked = await dialog.showOpenDialog(options.dialogWindow?.() ?? window, {
        defaultPath: home,
        properties: ["openFile", "showHiddenFiles"],
      });
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
    // 用户点了“在终端中运行”：把这一行交给系统的终端程序（参数是数组，不经 shell）；调用前主进程已核对过命令
    runInTerminal: (command) => {
      execFile(
        "osascript",
        [
          "-e",
          `tell application "Terminal" to do script "${appleScriptText(command)}"`,
          "-e",
          'tell application "Terminal" to activate',
        ],
        () => {},
      );
    },
    readNpmrc: () => readFile(join(home, ".npmrc"), "utf8").catch(() => null),
  });
  const binDir = defaultCliBinDir(home);
  const launcher = runtime.kind === "packaged" ? cliLauncherPath(runtime.resourcesPath) : null;
  const host: CliHost = {
    runCli: (args) =>
      runBundledCli({
        execPath: process.execPath,
        entry: cliEntry(runtime),
        args,
        home,
        parentEnv: process.env,
      }),
    link:
      launcher === null
        ? null
        : {
            binDir,
            state: () => readCliLink(binDir, launcher),
            install: () => installCliLink(binDir, launcher),
            uninstall: () => uninstallCliLink(binDir),
          },
    loginPath: async () => (await platform.env.load()).env.PATH ?? null,
    version: clientIdentity(runtime).version,
    home,
    exists,
    shellName: () => basename(process.env.SHELL ?? "zsh"),
    revealInFileManager: (path) => shell.showItemInFolder(path),
    openSkillGuide: async (locale) => readFile(skillGuidePath(runtime, locale), "utf8"),
  };
  return { toolchain, cli: new CliSettings(client, host) };
}
