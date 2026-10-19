import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import { numbers, windowBackground } from "@runyard/tokens";
import { BrowserWindow, nativeTheme, screen } from "electron";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import { APP_ORIGIN } from "../app-protocol.ts";
import { SettingsWindowController } from "../settings-window.ts";

interface Options {
  preloadPath: string;
  statePath: string;
  platform: BootstrapInfo["platform"];
  locale: Locale;
  onFocusChanged: (focused: boolean) => void;
}

function readBounds(file: string): Bounds | null {
  try {
    const b = JSON.parse(readFileSync(file, "utf8")) as Bounds;
    if (![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null;
    if (
      b.width < numbers["size-settings-window-min-width"] ||
      b.height < numbers["size-settings-window-min-height"]
    )
      return null;
    // 显示器被拔掉后不能把窗口恢复到屏幕之外。
    const area = screen.getDisplayMatching(b).workArea;
    const width = Math.min(b.width, area.width);
    const height = Math.min(b.height, area.height);
    return {
      width,
      height,
      x: Math.max(area.x, Math.min(b.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(b.y, area.y + area.height - height)),
    };
  } catch {
    return null;
  }
}

export function createSettingsWindowHost(options: Options) {
  let locale = options.locale;
  const title = () =>
    createTranslator({
      locale,
      platform: options.platform === "darwin" ? "darwin" : "linux",
      catalogs: desktopCatalogs,
    }).t("settings.page.title");
  const controller = new SettingsWindowController({
    load: () => readBounds(options.statePath),
    save: (bounds) => {
      try {
        mkdirSync(dirname(options.statePath), { recursive: true });
        const temp = `${options.statePath}.tmp`;
        writeFileSync(temp, JSON.stringify(bounds));
        renameSync(temp, options.statePath);
      } catch {
        /* 界面位置保存失败不能阻止关闭；下次使用默认位置。 */
      }
    },
    create: (bounds) => {
      const window = new BrowserWindow({
        width: numbers["size-settings-window-width"],
        height: numbers["size-settings-window-height"],
        ...(bounds ?? {}),
        minWidth: numbers["size-settings-window-min-width"],
        minHeight: numbers["size-settings-window-min-height"],
        title: title(),
        show: false,
        fullscreenable: false,
        maximizable: false,
        backgroundColor: (nativeTheme.shouldUseDarkColors
          ? windowBackground.dark
          : windowBackground.light
        ).workspace,
        ...(options.platform === "darwin"
          ? {
              titleBarStyle: "hiddenInset" as const,
              trafficLightPosition: {
                x: numbers["size-window-buttons-inset"],
                y: numbers["size-window-buttons-inset"],
              },
            }
          : {}),
        webPreferences: {
          preload: options.preloadPath,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
      });
      window.on("focus", () => options.onFocusChanged(true));
      window.on("blur", () => options.onFocusChanged(false));
      window.on("closed", () => options.onFocusChanged(false));
      void window.loadURL(`${APP_ORIGIN}/?view=settings`).catch((error: unknown) => {
        // 页面还没载完就关窗会中止加载；这是正常关闭，不能变成未处理的进程异常。
        if (window.isDestroyed()) return;
        // i18n-allow: 仅写启动终端的开发者诊断，不向界面显示技术报错
        process.stderr.write(`设置窗口加载失败：${String(error)}\n`);
        window.close();
      });
      return window;
    },
  });
  return {
    controller,
    setLocale: (next: Locale) => {
      locale = next;
      controller.current?.setTitle(title());
    },
  };
}
