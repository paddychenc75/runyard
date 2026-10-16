import { clipboard, shell } from "electron";
import type { SystemActions } from "../library-controller.ts";

// 系统层的两个动作。“在访达中显示”用 Electron 的 shell（访达是系统程序，
// 只能发出请求，没法在自动化测试里断言它真的选中了文件夹，规格 DESKTOP-LIBRARY-VIEW-12 是手动验证）。
export class ElectronSystemActions implements SystemActions {
  revealInFileManager(path: string): void {
    shell.showItemInFolder(path);
  }

  copyText(text: string): void {
    clipboard.writeText(text);
  }

  openExternal(url: string): void {
    void shell.openExternal(url);
  }
}
