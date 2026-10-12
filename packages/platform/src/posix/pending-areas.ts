import type { Platform } from "../platform.ts";
import { notImplemented } from "./pending-members.ts";

// 各块占位：负责的 issue 写在这里，替换时一目了然（环境、工具、shell：#26；exec.which / exec.spawn、proc、ports 已在 #25 实现；
// ipc 与 spawnDetached：#27；fs 与 watch：#28；desktop 与 cli：随桌面应用，M1 不做）。

const APP = "desktop app, after M1";

export const pendingEnv: Platform["env"] = {
  load: () => notImplemented("env.load", "#26"),
  runDefaults: () => notImplemented("env.runDefaults", "#26"),
};

export const pendingSpawnDetached: Platform["exec"]["spawnDetached"] = () =>
  notImplemented("exec.spawnDetached", "#27");

export const pendingFs: Platform["fs"] = {
  moveDir: () => notImplemented("fs.moveDir", "#28"),
  trash: () => notImplemented("fs.trash", "#28"),
  writeAtomic: () => notImplemented("fs.writeAtomic", "#28"),
};

export const pendingWatch: Platform["watch"] = () => notImplemented("watch", "#28");

export const pendingIpc: Platform["ipc"] = {
  endpoint: () => notImplemented("ipc.endpoint", "#27"),
  listen: () => notImplemented("ipc.listen", "#27"),
  connect: () => notImplemented("ipc.connect", "#27"),
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
