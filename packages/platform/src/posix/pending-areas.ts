import type { Platform } from "../platform.ts";
import { notImplemented } from "./pending-members.ts";

// 各块占位：负责的 issue 写在这里，替换时一目了然（环境、工具、shell：#26；
// fs 与 watch：#28；desktop 与 cli：随桌面应用，M1 不做）。ipc 与 spawnDetached 已由 #27 实现，见 posix/ipc/ 和 posix/spawn-detached.ts；
// exec.which、exec.spawn、proc、ports 已由 #25 实现，见 posix/posix-exec.ts、posix-proc.ts、posix-ports.ts；
// fs 与 watch 已由 #28 实现，见 posix/fs/ 和 darwin/trash/。

const APP = "desktop app, after M1";

export const pendingEnv: Platform["env"] = {
  load: () => notImplemented("env.load", "#26"),
  runDefaults: () => notImplemented("env.runDefaults", "#26"),
};

export const pendingTools: Platform["tools"] = {
  candidates: () => notImplemented("tools.candidates", "#26"),
  packageManagers: () => notImplemented("tools.packageManagers", "#26"),
};

export const pendingShell: Platform["shell"] = {
  interactive: () => notImplemented("shell.interactive", "#26"),
};

export const pendingDesktop: Platform["desktop"] = {
  reveal: () => notImplemented("desktop.reveal", APP),
  openTerminalAt: () => notImplemented("desktop.openTerminalAt", APP),
  openInEditor: () => notImplemented("desktop.openInEditor", APP),
};

export const pendingCli: Platform["cli"] = {
  installShim: () => notImplemented("cli.installShim", APP),
};
