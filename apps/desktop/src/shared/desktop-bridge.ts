import type { Locale } from "@runyard/i18n";
import type { Settings } from "@runyard/protocol";
import type { ConsoleAppend, ConsoleLine } from "./console-state.ts";
import {
  type EditorFileMethods,
  editorFileMethodNames,
  type FilesChanged,
} from "./editor-files.ts";
import type { Bounds } from "./layout.ts";
import type { DesktopError, LibraryState } from "./library-state.ts";
import { type SettingsMethods, settingsMethodNames } from "./settings-bridge.ts";

// 预加载脚本交给界面的窄接口，只有三样：同步的启动信息 bootstrap、按名字调用的 call、订阅事件的 on。
// 方法名和事件名是白名单（下面两张表）；界面发不出表外的消息，也拿不到 ipcRenderer。
// 动作的失败不抛给界面，折进状态里的 error（代码加参数）。

export const desktopChannels = {
  call: "desktop:call",
  bootstrap: "desktop:bootstrap",
  event: "desktop:event",
} as const;

/** 新建弹窗交上来的内容；主进程不信任它，逐项校验 */
export interface CreateRequest {
  template: string;
  name: string;
  /** 没写是空串 */
  note: string;
  /** 自动清理的天数；关闭（已保留）是 null */
  autoClean: number | null;
}
export type CreateResult = { ok: true } | { ok: false; error: DesktopError };

export interface QuitReply {
  id: number;
  reply: "ack" | "proceed" | "cancel";
}

/** 界面可以调用的方法：参数类型与返回类型 */
export interface DesktopMethods extends EditorFileMethods, SettingsMethods {
  "library.get": { param: undefined; result: LibraryState };
  "run.start": { param: string; result: undefined };
  "run.stop": { param: string; result: undefined };
  /** 打开项目：新开标签并启动运行（持有者是这个标签）；已开着的只切换 */
  "tab.open": { param: string; result: undefined };
  /** 切到资源库（"library"）或已打开的项目标签 */
  "tab.select": { param: string; result: undefined };
  /** 新建弹窗的“创建并运行”：创建项目、打开它的标签页并运行；失败（重名、不合法……）原样交回给弹窗显示在名称下 */
  "playground.create": { param: CreateRequest; result: CreateResult };
  /** 请求关闭项目标签（关闭钮、⌘W）：运行中且由标签持有时先出确认（状态里的 closeRequest），否则直接关 */
  "tab.close": { param: string; result: undefined };
  /** 确认关闭并停止；dontAskAgain 为真就记住“不再提示” */
  "tab.closeConfirm": { param: { id: string; dontAskAgain: boolean }; result: undefined };
  /** 取消关闭：什么都不变，也不记住勾选 */
  "tab.closeCancel": { param: undefined; result: undefined };
  /** 退出前的回执（规格 DESKTOP-EDITOR-27、28）：界面收到 app.quitRequested 后先 ack，写完或问完后 proceed（可以退出）或 cancel（用户取消，不退出） */
  "app.quitReply": { param: QuitReply; result: undefined };
  /** 在系统文件管理器（访达）里选中项目文件夹 */
  "playground.reveal": { param: string; result: undefined };
  /** 把项目文件夹的绝对路径放进剪贴板 */
  "playground.copyPath": { param: string; result: undefined };
  /** 把一段文字放进剪贴板（缺工具画面的“复制命令”）；命令只展示和复制，应用从不执行 */
  "clipboard.copy": { param: string; result: undefined };
  /** 用系统浏览器打开一个 https 链接（安装说明的官网）；别的协议主进程不理 */
  "link.open": { param: string; result: undefined };
  /** 预览占位区在窗口里的位置和大小（CSS 像素）；占位区卸载时报 null */
  "preview.bounds": { param: Bounds | null; result: undefined };
  /** 截预览当前的一帧（PNG 的 data 地址）；没有预览是 null。浮层打开前先截帧再隐藏（技术设计 §6.1） */
  "preview.capture": { param: undefined; result: string | null };
  /** 显示或隐藏预览视图；浮层关闭后恢复 */
  "preview.visible": { param: boolean; result: undefined };
  /** 项目标签页控制台已有的全部输出；界面挂载时取一份，后面的新输出走 console.appended */
  "console.get": { param: string; result: ConsoleLine[] };
}
export type DesktopMethod = keyof DesktopMethods;

export const desktopMethodNames: readonly DesktopMethod[] = [
  "library.get",
  "run.start",
  "run.stop",
  "tab.open",
  "tab.select",
  "playground.create",
  "tab.close",
  "tab.closeConfirm",
  "tab.closeCancel",
  "app.quitReply",
  "playground.reveal",
  "playground.copyPath",
  "clipboard.copy",
  "link.open",
  "preview.bounds",
  "preview.capture",
  "preview.visible",
  "console.get",
  ...editorFileMethodNames,
  ...settingsMethodNames,
];

/** 主进程推给界面的事件 */
export interface DesktopEvents {
  "library.changed": LibraryState;
  "console.appended": ConsoleAppend;
  /** 应用菜单的“新建…”（⌘N）：焦点在预览视图里时按键到不了界面，所以由主进程通知 */
  "picker.open": undefined;
  /** 应用要退出了：编辑器先把未保存的修改写入（自动保存关着的先问用户），再用 app.quitReply 回话 */
  "app.quitRequested": { id: number };
  /** 项目文件夹里的文件变了（监听由 files.watch 开启）：目录树更新和外部修改提示靠它 */
  "files.changed": FilesChanged;
  /** 设置变了（设置页、命令行或别处改的）：带改后的全部设置 */
  "settings.changed": Settings;
}
export type DesktopEventName = keyof DesktopEvents;

export const desktopEventNames: readonly DesktopEventName[] = [
  "library.changed",
  "console.appended",
  "picker.open",
  "app.quitRequested",
  "files.changed",
  "settings.changed",
];

/** 启动信息：主进程建窗口时算好，预加载脚本同步交给界面（技术设计 §6.7；协议包建好该类型后移过去） */
export interface BootstrapInfo {
  platform: "darwin" | "win32" | "linux";
  windowControls: { side: "left" | "right"; inset: number };
  modKey: "meta" | "ctrl";
  locale: Locale;
  theme: "system" | "light" | "dark";
  reducedTransparency: boolean;
  highContrast: boolean;
}

export interface DesktopBridge {
  readonly bootstrap: BootstrapInfo;
  call<M extends DesktopMethod>(
    method: M,
    ...param: DesktopMethods[M]["param"] extends undefined ? [] : [DesktopMethods[M]["param"]]
  ): Promise<DesktopMethods[M]["result"]>;
  /** 返回取消订阅的函数 */
  on<E extends DesktopEventName>(
    event: E,
    listener: (payload: DesktopEvents[E]) => void,
  ): () => void;
}
