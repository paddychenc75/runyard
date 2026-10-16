import { BrowserWindow } from "electron";
import { APP_ORIGIN } from "./app-protocol.ts";

// 唯一的窗口：沙箱、上下文隔离、没有 Node；只加载 app://runyard/ 下的界面，页面不能自己跳走或开新窗口。

export interface MainWindowOptions {
  preloadPath: string;
  show: boolean;
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 420,
    show: options.show,
    webPreferences: {
      preload: options.preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const contents = window.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, target) => {
    if (!target.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  return window;
}
