import { execFile } from "node:child_process";
import { clipboard, dialog, shell } from "electron";
import type { SystemActions } from "../library-controller.ts";

// 系统层的两个动作。“在访达中显示”用 Electron 的 shell（访达是系统程序，
// 只能发出请求，没法在自动化测试里断言它真的选中了文件夹，规格 DESKTOP-LIBRARY-VIEW-12 是手动验证）。
export class ElectronSystemActions implements SystemActions {
  revealInFileManager(path: string): void {
    shell.showItemInFolder(path);
  }

  openPath(path: string): void {
    void shell.openPath(path);
  }

  copyText(text: string): void {
    clipboard.writeText(text);
  }

  async readText(): Promise<string> {
    return clipboard.readText();
  }

  // 终端是系统程序：只能发出请求。参数是数组、不经 shell（规格 DESKTOP-LIBRARY-VIEW-48 是手动验证）
  openTerminal(path: string): void {
    execFile("open", ["-a", "Terminal", path], () => {});
  }

  async chooseFolder(defaultPath: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({ defaultPath, properties: ["openDirectory"] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  }

  openExternal(url: string): void {
    void shell.openExternal(url);
  }
}
