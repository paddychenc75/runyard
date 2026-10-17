import type { BrowserWindow } from "electron";
import { desktopChannels } from "../shared/desktop-bridge.ts";
import { ProjectFlushGate } from "./project-flush-gate.ts";
import { QuitFlushGate } from "./quit-flush-gate.ts";

/** 向界面问“编辑器有没有未保存的修改”的两道关口；渲染进程没了就不问、放行 */
export interface FlushGates {
  quit: QuitFlushGate;
  project: ProjectFlushGate;
}

export function createFlushGates(window: BrowserWindow): FlushGates {
  const quit = new QuitFlushGate((id) => {
    if (window.isDestroyed()) return false;
    window.webContents.send(desktopChannels.event, "app.quitRequested", { id });
    return true;
  });
  const project = new ProjectFlushGate((id, name, ask) => {
    if (window.isDestroyed()) return false;
    window.webContents.send(desktopChannels.event, "project.flushRequested", {
      id,
      project: name,
      ask,
    });
    return true;
  });
  window.webContents.on("render-process-gone", () => {
    quit.abandon();
    project.abandon();
  });
  return { quit, project };
}
