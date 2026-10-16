import { BrowserWindow, type BrowserWindowConstructorOptions } from "electron";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import { APP_ORIGIN } from "../app-protocol.ts";

// 唯一的窗口：沙箱、上下文隔离、没有 Node；只加载 app://runyard/ 下的界面，页面不能自己跳走或开新窗口。

export interface MainWindowOptions {
  preloadPath: string;
  show: boolean;
  /** 窗口底色，界面画出来之前显示，避免启动时白闪 */
  backgroundColor: string;
  /** 系统；决定标题栏怎么画（自绘标题栏，窗口按钮画在侧栏顶上） */
  platform: BootstrapInfo["platform"];
}

// 红黄绿三个按钮的左上角位置，对准设计稿 Main：悬浮侧栏左上角的一行（侧栏内边距 10、行内边距 8、
// 按钮直径 12，所以按钮从窗口左边 26 起；行垂直居中在 36，所以顶边 30）
const TRAFFIC_LIGHTS = { x: 26, y: 30 } as const;

function titleBarOptions(platform: BootstrapInfo["platform"]): BrowserWindowConstructorOptions {
  if (platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: TRAFFIC_LIGHTS };
  }
  // 其他系统先用系统自带的标题栏（第一版只发 macOS）
  return {};
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 720,
    minHeight: 420,
    show: options.show,
    backgroundColor: options.backgroundColor,
    ...titleBarOptions(options.platform),
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
