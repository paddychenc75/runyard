import type { Locale } from "@runyard/i18n";
import type { ErrorCode, LocalizedText, RunKind, RunState } from "@runyard/protocol";

// 主进程交给界面的全部数据。只有可序列化的普通对象：界面进程没有 Node，
// 也拿不到连接管理进程的客户端，只能看到这一份状态和 DesktopBridge 里的几个动作。

export interface PlaygroundRow {
  id: string;
  name: string;
  kind: RunKind;
  /** 最近一次运行的状态；从没运行过是 idle */
  state: RunState | "idle";
  /** 此刻是否有进行中的运行（决定显示“运行”还是“停止”） */
  active: boolean;
  /** 预览区正在显示（或等着显示）这个项目 */
  previewing: boolean;
  /** 正在等管理进程回应，按钮暂时不可点 */
  busy: boolean;
}

/** 标签上的状态小圆点；由最近一次运行的状态归并而来 */
export type TabStatus = "running" | "starting" | "stopped" | "crashed";

export interface TabRow {
  /** 项目 id（标签页 id 是 `tab-<项目 id>`，只在主进程绑定持有者时用） */
  id: string;
  name: string;
  status: TabStatus;
  state: RunState | "idle";
  /** 此刻是否有进行中的运行；false 时标签页内容区显示“运行”按钮 */
  active: boolean;
  busy: boolean;
  /** 页面已就绪时的预览地址（http://127.0.0.1:<端口>/）；没就绪是 null，预览区显示占位 */
  previewUrl: string | null;
}

export interface TemplateRow {
  id: string;
  name: LocalizedText;
}

/** 错误只带“代码加参数”，句子由界面用文案包生成 */
export interface DesktopError {
  code: ErrorCode;
  params: Record<string, unknown>;
}

export interface LibraryState {
  locale: Locale;
  playgrounds: PlaygroundRow[];
  /** 打开的项目标签，按打开顺序；资源库标签固定在最前，不在这里 */
  tabs: TabRow[];
  /** 当前标签："library" 或项目 id */
  activeTab: string;
  templates: TemplateRow[];
  error: DesktopError | null;
}
