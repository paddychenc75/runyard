// 关窗口与退出（规格 desktop/workspace「关闭窗口与退出应用」）：在 macOS 上关窗口只是藏起来，
// 应用和运行都继续，点 Dock 图标再显示，窗口里的状态（选中的项目、预览）原样还在；
// 真正退出只走 ⌘Q（before-quit）。其他系统关掉最后一个窗口就退出。
// Electron 的对象以最小接口传进来，测试里换成假的。

export interface ClosableWindow {
  on(event: "close", listener: (event: { preventDefault(): void }) => void): void;
  hide(): void;
  show(): void;
  isDestroyed(): boolean;
}

export interface LifecycleApp {
  on(event: "before-quit", listener: () => void): void;
  on(event: "activate", listener: () => void): void;
  on(event: "window-all-closed", listener: () => void): void;
  quit(): void;
}

export function keepAliveAfterClose(
  app: LifecycleApp,
  window: ClosableWindow,
  closeKeepsAppAlive: boolean,
): void {
  if (!closeKeepsAppAlive) {
    app.on("window-all-closed", () => app.quit());
    return;
  }
  let quitting = false;
  app.on("before-quit", () => {
    quitting = true;
  });
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  app.on("activate", () => {
    if (!window.isDestroyed()) window.show();
  });
}
