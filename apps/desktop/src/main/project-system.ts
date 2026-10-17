import type { SystemActions } from "./controller-hosts.ts";

// 更多菜单和缺工具画面的系统层动作：路径取管理进程给的那份，界面只报项目 id。
// 访达、终端是系统程序，这里只发请求（规格 DESKTOP-LIBRARY-VIEW-12、48 手动验证）。
export class ProjectSystem {
  readonly #system: SystemActions;
  readonly #folderOf: (playgroundId: string) => string | null;

  constructor(system: SystemActions, folderOf: (playgroundId: string) => string | null) {
    this.#system = system;
    this.#folderOf = folderOf;
  }

  /** “在访达中显示” */
  reveal(playgroundId: string): void {
    const path = this.#folderOf(playgroundId);
    if (path !== null) this.#system.revealInFileManager(path);
  }

  /** “复制路径”：项目文件夹的绝对路径 */
  copyPath(playgroundId: string): void {
    const path = this.#folderOf(playgroundId);
    if (path !== null) this.#system.copyText(path);
  }

  /** “在终端中打开” */
  openTerminal(playgroundId: string): void {
    const path = this.#folderOf(playgroundId);
    if (path !== null) this.#system.openTerminal(path);
  }

  /** 缺工具画面的“复制命令”：只放进剪贴板，从不执行 */
  copyText(text: string): void {
    this.#system.copyText(text);
  }

  /** 安装说明的官网：只放行 https（链接来自模板或工具定义，不可全信） */
  openLink(url: string): void {
    if (/^https:\/\/\S+$/.test(url)) this.#system.openExternal(url);
  }
}
