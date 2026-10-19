import { BrowserWindow, ipcMain } from "electron";
import type { IpcHost } from "../ipc-handlers.ts";

/** 设置窗只接收共享数据，主窗命令、预览和编辑器退出请求不能广播给它。 */
export function createDesktopIpcHost(
  window: BrowserWindow,
  settingsWindow: () => BrowserWindow | null,
): IpcHost {
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
      if (["library.changed", "settings.changed", "toolchain.changed"].includes(name)) {
        settingsWindow()?.webContents.send(channel, name, payload);
      }
    },
  };
}

/** 只允许本应用的两个窗口承接系统选择框；后台的设置窗口不能抢走主窗口发起的选择框。 */
export function settingsDialogOwner(
  main: BrowserWindow,
  settings: BrowserWindow | null,
): BrowserWindow {
  return settings !== null && BrowserWindow.getFocusedWindow() === settings ? settings : main;
}
