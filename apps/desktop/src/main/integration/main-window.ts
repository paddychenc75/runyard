import { BrowserWindow } from "electron";
import { APP_ORIGIN } from "../app-protocol.ts";

// 唯一的窗口：沙箱、上下文隔离、没有 Node；只加载 app://runyard/ 下的界面，页面不能自己跳走或开新窗口。

export interface MainWindowOptions {
  preloadPath: string;
  show: boolean;
  /** 窗口底色，界面画出来之前显示，避免启动时白闪 */
  backgroundColor: string;
}

// 暂时的占位：技术设计 §3.2 规定窗口底色取自 @runyard/tokens，而该包（#162）还没合并。
// 合并后改成从 tokens 读，并随系统的深浅色选值。
export const PLACEHOLDER_BACKGROUND = { light: "#ffffff", dark: "#1e1e1e" } as const;

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 420,
    show: options.show,
    backgroundColor: options.backgroundColor,
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
