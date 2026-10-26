import { type BrowserWindow, ipcMain } from "electron";
import type { IpcHost } from "../ipc-handlers.ts";

/** 页面共享主窗口，所有界面事件只交给这一个窗口。 */
export function createDesktopIpcHost(window: BrowserWindow): IpcHost {
  return {
    handle: (channel, handler) =>
      ipcMain.handle(channel, (event, ...rest) =>
        handler({ url: event.senderFrame?.url ?? "" }, ...rest),
      ),
    handleSync: (channel, handler) =>
      ipcMain.on(channel, (event) => {
        try {
          event.returnValue = handler({ url: event.senderFrame?.url ?? "" });
        } catch {
          event.returnValue = null;
        }
      }),
    send: (channel, name, payload) => {
      if (!window.isDestroyed()) window.webContents.send(channel, name, payload);
    },
  };
}
