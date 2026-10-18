import { createTranslator, desktopCatalogs, type Locale } from "@runyard/i18n";
import { type BrowserWindow, dialog, Menu } from "electron";
import {
  type IpcHost,
  requestCommand,
  requestPalette,
  requestPicker,
  requestSidebarToggle,
} from "../ipc-handlers.ts";
import { buildAppMenu } from "./app-menu.ts";

// 把应用菜单的模板（app-menu.ts，纯数据）接到 Electron：安装菜单、把菜单动作变成给界面的请求、
// 语言或“是否在项目标签页”变了就重建。

// 帮助菜单的两个链接：第一版没有单独的帮助站，帮助指向仓库首页，报告问题指向新建议题
export const HELP_URL = "https://github.com/paddychenc75/runyard#readme";
export const REPORT_ISSUE_URL = "https://github.com/paddychenc75/runyard/issues/new";

export interface MenuHostDeps {
  window: BrowserWindow;
  ipcHost: Pick<IpcHost, "send">;
  locale: Locale;
  platform: "darwin" | "win32" | "linux";
  /** 开发构建（从源码运行）：菜单里多出重新载入和开发者工具 */
  development: boolean;
  version: string;
  openExternal: (url: string) => void;
  /** 手动检查更新；有新版本时提示条自己会出现，其余结果由这里用对话框告诉用户 */
  checkUpdates: () => Promise<"newer" | "latest" | "failed" | "unavailable">;
}

export interface MenuHost {
  /** 安装菜单；传了新语言就换成新语言 */
  install: (locale?: Locale) => void;
  /** 切到或离开项目标签页：项目相关的菜单项跟着可用或灰掉（规格 DESKTOP-EDITOR-73） */
  setProjectTabActive: (active: boolean) => void;
}

export function createMenuHost(deps: MenuHostDeps): MenuHost {
  const { window, ipcHost } = deps;
  let locale = deps.locale;
  let projectTabActive = false;
  const translator = () =>
    createTranslator({
      locale,
      platform: deps.platform === "darwin" ? "darwin" : "linux",
      catalogs: desktopCatalogs,
    }).t;
  // 预览是另一个网页：菜单触发时键盘焦点可能在它里面，先把焦点交回界面，输入框才收得到字
  const toInterface = (send: () => void): void => {
    window.webContents.focus();
    send();
  };
  // 用户主动点的检查：没有新版本或没查成时不能像后台检查那样沉默
  const checkUpdates = async (): Promise<void> => {
    const result = await deps.checkUpdates();
    if (result === "newer") return;
    const t = translator();
    await dialog.showMessageBox(window, {
      type: "info",
      message: t("desktop.menu.update.title"),
      detail:
        result === "latest"
          ? t("desktop.menu.updateLatest.body", { version: deps.version })
          : result === "failed"
            ? t("desktop.menu.updateFailed.body")
            : t("desktop.menu.updateUnavailable.body"),
    });
  };
  const install = (next?: Locale): void => {
    if (next !== undefined) locale = next;
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildAppMenu({
          locale,
          platform: deps.platform,
          development: deps.development,
          runCommand: (id) =>
            toInterface(() => {
              if (id === "app.new") requestPicker(ipcHost);
              else if (id === "app.toggleSidebar") requestSidebarToggle(ipcHost);
              else requestCommand(ipcHost, id);
            }),
          onCommandPalette: () => toInterface(() => requestPalette(ipcHost, "commands")),
          onQuickOpen: () => toInterface(() => requestPalette(ipcHost, "files")),
          onCheckUpdates: () => void checkUpdates(),
          onOpenHelp: () => deps.openExternal(HELP_URL),
          onReportIssue: () => deps.openExternal(REPORT_ISSUE_URL),
          projectTabActive,
        }),
      ),
    );
  };
  return {
    install,
    setProjectTabActive: (active) => {
      if (active === projectTabActive) return;
      projectTabActive = active;
      install();
    },
  };
}
