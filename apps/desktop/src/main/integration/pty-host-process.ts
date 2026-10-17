import { utilityProcess } from "electron";
import type { HostCommand, HostEvent } from "../../shared/pty-host-messages.ts";
import type { PtyHostLink } from "../terminal/terminal-service.ts";

// 把 Electron 的 utilityProcess 接成 PtyHostLink（技术设计 §6.3：node-pty 放在单独的 pty-host 进程里，
// 它崩了不连累主进程）。模块路径是构建出的 dist/pty-host/index.cjs；打包后在 app.asar 里，原生文件在 app.asar.unpacked。

export function launchPtyHost(modulePath: string): PtyHostLink {
  const child = utilityProcess.fork(modulePath, [], { serviceName: "Runyard Terminal" });
  const listeners: ((event: HostEvent) => void)[] = [];
  const exitListeners: (() => void)[] = [];
  child.on("message", (message: unknown) => {
    for (const listener of listeners) listener(message as HostEvent);
  });
  child.on("exit", () => {
    for (const listener of exitListeners) listener();
  });
  return {
    post: (command: HostCommand) => child.postMessage(command),
    onEvent: (listener) => void listeners.push(listener),
    onExit: (listener) => void exitListeners.push(listener),
    kill: () => void child.kill(),
  };
}
