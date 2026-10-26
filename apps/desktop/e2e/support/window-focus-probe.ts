import type { RunyardApp } from "./launch.ts";

/** 只记录当前隔离实例的原生窗口与应用激活，不读其它应用或屏幕。 */
export async function installWindowFocusProbe(runyard: RunyardApp) {
  await runyard.app.evaluate(({ app, BrowserWindow }) => {
    const records: unknown[] = [];
    Object.assign(globalThis, { settingsFocusRecords: records });
    const record = (event: string) =>
      records.push({
        event,
        time: Date.now(),
        active: app.isActive(),
        hidden: app.isHidden(),
        windows: BrowserWindow.getAllWindows().map((window) => ({
          id: window.id,
          visible: window.isVisible(),
          focused: window.isFocused(),
          minimized: window.isMinimized(),
        })),
      });
    app.on("did-become-active", () => record("did-become-active"));
    app.on("did-resign-active", () => record("did-resign-active"));
    for (const window of BrowserWindow.getAllWindows()) {
      window.on("show", () => record("show"));
      window.on("hide", () => record("hide"));
      window.on("focus", () => record("focus"));
      window.on("blur", () => record("blur"));
    }
    record("installed");
  });
}

export async function windowFocusProbe(runyard: RunyardApp) {
  return runyard.app.evaluate(({ app, BrowserWindow }) => ({
    active: app.isActive(),
    hidden: app.isHidden(),
    windows: BrowserWindow.getAllWindows().map((window) => ({
      id: window.id,
      visible: window.isVisible(),
      focused: window.isFocused(),
      minimized: window.isMinimized(),
      rendererFocused: window.webContents.isFocused(),
    })),
    events: (globalThis as { settingsFocusRecords?: unknown[] }).settingsFocusRecords ?? [],
  }));
}
