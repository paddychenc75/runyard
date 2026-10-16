import type { Locale } from "@runyard/i18n";
import type { LibraryState } from "./library-state.ts";

// 预加载脚本交给界面的窄接口，只有三样：同步的启动信息 bootstrap、按名字调用的 call、订阅事件的 on。
// 方法名和事件名是白名单（下面两张表）；界面发不出表外的消息，也拿不到 ipcRenderer。
// 动作的失败不抛给界面，折进状态里的 error（代码加参数）。

export const desktopChannels = {
  call: "desktop:call",
  bootstrap: "desktop:bootstrap",
  event: "desktop:event",
} as const;

/** 界面可以调用的方法：参数类型与返回类型 */
export interface DesktopMethods {
  "library.get": { param: undefined; result: LibraryState };
  "run.start": { param: string; result: undefined };
  "run.stop": { param: string; result: undefined };
  /** 打开项目：新开标签并启动运行（持有者是这个标签）；已开着的只切换 */
  "tab.open": { param: string; result: undefined };
  /** 切到资源库（"library"）或已打开的项目标签 */
  "tab.select": { param: string; result: undefined };
  "playground.create": { param: string; result: undefined };
}
export type DesktopMethod = keyof DesktopMethods;

export const desktopMethodNames: readonly DesktopMethod[] = [
  "library.get",
  "run.start",
  "run.stop",
  "tab.open",
  "tab.select",
  "playground.create",
];

/** 主进程推给界面的事件 */
export interface DesktopEvents {
  "library.changed": LibraryState;
}
export type DesktopEventName = keyof DesktopEvents;

export const desktopEventNames: readonly DesktopEventName[] = ["library.changed"];

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
