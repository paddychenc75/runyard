import { access } from "node:fs/promises";
import { type BrowserWindow, dialog, nativeTheme, shell } from "electron";
import type { SettingsHost } from "../settings-controller.ts";
import { detectEditors, openFolderInEditor } from "./external-editors.ts";
import { isInPrivacyProtectedFolder } from "./privacy-folders.ts";

export interface ElectronSettingsHostOptions {
  home: string;
  window: BrowserWindow;
  dialogWindow?: () => BrowserWindow;
  /** 语言变了：重建应用菜单 */
  onLocaleChanged: SettingsHost["localeChanged"];
}

const exists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false,
  );

// 设置页要的系统动作：系统外观、文件夹选择器、访达、编辑器。这些在自动化测试里没法看到真的发生，
// 控制器的逻辑用假的 SettingsHost 测，这里只做薄薄的转接。
export function createElectronSettingsHost(options: ElectronSettingsHostOptions): SettingsHost {
  const { home, window } = options;
  return {
    setTheme: (theme) => {
      nativeTheme.themeSource = theme;
    },
    editors: () => detectEditors(home, exists),
    openInEditor: (editorId, folder) => openFolderInEditor(editorId, folder),
    openDefault: (folder) => void shell.openPath(folder),
    chooseFolder: async (defaultPath) => {
      const picked = await dialog.showOpenDialog(options.dialogWindow?.() ?? window, {
        defaultPath,
        properties: ["openDirectory", "createDirectory"],
      });
      return picked.canceled ? null : (picked.filePaths[0] ?? null);
    },
    revealInFileManager: (path) => shell.showItemInFolder(path),
    isPrivacyProtected: (path) => isInPrivacyProtectedFolder(home, path),
    localeChanged: options.onLocaleChanged,
  };
}
