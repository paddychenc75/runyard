import type { RunyardClient } from "@runyard/client";
import type { Locale } from "@runyard/i18n";
import type { Bounds } from "../shared/layout.ts";

// 控制器对外面的两个依赖（接口）：预览视图的宿主和系统层动作。真实的在 Electron 接线里，测试里换假的。

/** 预览视图的宿主。同一个项目、同一个地址再次 show 时应当什么都不做 */
export interface PreviewHost {
  show(playgroundId: string, url: string): void;
  /** 藏起当前预览但保留视图（切到资源库或别的标签） */
  hide(): void;
  /** 销毁这个项目的预览视图（标签被去掉、或页面没了/不再就绪） */
  release(playgroundId: string): void;
  /** 占位区的位置；null 是占位区不在了 */
  setBounds(bounds: Bounds | null): void;
  /** 截当前预览的一帧；没有预览是 null */
  capture(): Promise<string | null>;
  setVisible(visible: boolean): void;
  /** 重新加载当前预览；真实宿主的 Promise 等到加载结束或视图销毁（规格 DESKTOP-WORKSPACE-31、71） */
  reload(playgroundId: string): void | Promise<void>;
  /** 这个项目预览此刻加载着的地址；没有预览是 undefined（规格 DESKTOP-WORKSPACE-32） */
  currentUrl(playgroundId: string): string | undefined;
  /** 打开这个项目预览页面自己的开发者工具，不是应用界面的（规格 DESKTOP-WORKSPACE-33） */
  openDevTools(playgroundId: string): void;
}

/** 系统层的两个动作（Electron 的 shell 和剪贴板在 integration/system-actions.ts，这里不认识 Electron） */
export interface SystemActions {
  /** 在文件管理器里选中这个路径 */
  revealInFileManager(path: string): void;
  copyText(text: string): void;
  /** 读剪贴板里的文字（终端的粘贴） */
  readText(): Promise<string>;
  /** 在系统终端里打开一个位于这个文件夹的窗口 */
  openTerminal(path: string): void;
  /** 文件夹选择器（“重新定位…”）；取消是 null */
  chooseFolder(defaultPath: string): Promise<string | null>;
  /** 用系统浏览器打开链接；调用前已确认是 https */
  openExternal(url: string): void;
}

/** 控制器对终端服务的要求（实现在 terminal/terminal-service.ts，这里只列用到的） */
export interface TerminalHooks {
  /** 结束项目的终端和里面的命令；做完才兑现 */
  end(id: string, reason: "closed" | "renamed" | "trashed"): Promise<void>;
  /** 终端里正在运行的命令名；空闲或没有终端是 null */
  runningCommand(id: string): Promise<string | null>;
}

/** Dock 图标的角标（macOS）：写待清理的项目数，0 是清掉；接线在 integration/dock-badge.ts */
export interface DockBadge {
  set(count: number): void;
}

/** 上次退出时的标签页（规格 DESKTOP-WORKSPACE-51）：按顺序，running 是当时是否在运行（切过去时是否要启动） */
export interface SavedSession {
  tabs: { id: string; running: boolean }[];
  /** 当前显示的标签："library" 或项目 id */
  active: string;
}

/** 标签页的存放处；读不到或坏了就当没有，存失败不影响使用 */
export interface SessionStore {
  load(): Promise<SavedSession | null>;
  save(session: SavedSession): Promise<void>;
}

/** 控制器用到的客户端的那一小部分 */
export type LibraryClient = Pick<RunyardClient, "call" | "subscribe" | "followLogs">;

export interface LibraryControllerOptions {
  client: LibraryClient;
  /** 这个应用实例的连接标识；标签页持有者靠它绑定到本连接（PRD #prd-run-ownership） */
  clientId: string;
  locale: Locale;
  preview: PreviewHost;
  system: SystemActions;
  /** 主目录（用来把资源库路径显示成 ~/…）；开发时 --root 给的目录算主目录 */
  home: string;
  /** 恢复和记住标签页；不给就不恢复（测试和冒烟） */
  session?: SessionStore;
  /** 集成终端；不给就当没有终端（测试和冒烟） */
  terminals?: TerminalHooks;
  /** 毫秒时钟；启动清单各步的用时靠它量，测试里换成假的 */
  now?: () => number;
  /** Dock 角标；不给就不写（测试和冒烟） */
  dock?: DockBadge;
  /** 这个路径在网盘同步目录下吗（平台层 `paths.isCloudSynced`）；不给就当不在 */
  isCloudSynced?: (path: string) => boolean;
}
