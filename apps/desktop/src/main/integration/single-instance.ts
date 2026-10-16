import type { BrowserWindow } from "electron";

// 单实例：同一份用户数据目录只许一个应用进程。第二次启动拿不到锁就直接退出，
// 由第一个进程收到 second-instance 事件，把已有窗口带到前面。Electron 的 app 以最小接口传进来。

export interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  on(event: "second-instance", listener: () => void): void;
  exit(code: number): void;
}

/** 返回 false 表示已有实例在运行，本进程已安排退出，调用方不要再往下做任何事 */
export function claimSingleInstance(app: SingleInstanceApp, focusExisting: () => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
    return false;
  }
  app.on("second-instance", focusExisting);
  return true;
}

export function focusWindow(window: BrowserWindow | null): void {
  if (window === null || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
