import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import type { MenuItemConstructorOptions } from "electron";

// 应用菜单（规格 DESKTOP-CREATE-FLOW-03、DESKTOP-LIBRARY-VIEW-61）：⌘N 和 ⌃⌘S 注册成菜单项，所以焦点在预览视图里（那是另一个
// 网页，按键到不了界面）也有效。其余项用 Electron 的系统角色，名字由系统按语言给。
// 平台作为参数传进来：只有 macOS 有以应用名为标题的第一项。

export interface AppMenuOptions {
  locale: Locale;
  platform: "darwin" | "win32" | "linux";
  /** 点“新建…”或按 ⌘N（Ctrl+N） */
  onNew: () => void;
  /** 点“切换侧栏”或按 ⌃⌘S（规格 DESKTOP-LIBRARY-VIEW-61） */
  onToggleSidebar: () => void;
}

export function buildAppMenu(options: AppMenuOptions): MenuItemConstructorOptions[] {
  const { t } = createTranslator({
    locale: options.locale,
    platform: options.platform === "darwin" ? "darwin" : "linux",
    catalogs: desktopCatalogs,
  });
  return [
    ...(options.platform === "darwin" ? [{ role: "appMenu" } as const] : []),
    {
      role: "fileMenu",
      submenu: [
        { label: t("desktop.menu.new.label"), accelerator: "CmdOrCtrl+N", click: options.onNew },
        { type: "separator" },
        { role: "close" },
      ],
    },
    { role: "editMenu" },
    {
      role: "viewMenu",
      submenu: [
        {
          label: t("desktop.menu.sidebar.label"),
          accelerator: options.platform === "darwin" ? "Ctrl+Cmd+S" : "Ctrl+Alt+S",
          click: options.onToggleSidebar,
        },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
}
