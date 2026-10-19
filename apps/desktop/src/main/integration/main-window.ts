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

// macOS 统一工具栏位置：原生按钮框左上角19/19，圆心位于26/26。
const TRAFFIC_LIGHTS = { x: 19, y: 19 } as const;

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
