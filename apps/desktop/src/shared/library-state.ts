import type { Locale } from "@runyard/i18n";
import type { CreatedBy, ErrorCode, LocalizedText, RunKind, RunState } from "@runyard/protocol";

// 主进程交给界面的全部数据。只有可序列化的普通对象：界面进程没有 Node，
// 也拿不到连接管理进程的客户端，只能看到这一份状态和 DesktopBridge 里的几个动作。

export interface PlaygroundRow {
  id: string;
  name: string;
  /** 项目文件夹的绝对路径（“在访达中显示”“复制路径”用，界面不拼路径） */
  path: string;
  kind: RunKind;
  /** 最近一次运行的状态；从没运行过是 idle */
  state: RunState | "idle";
  /** 此刻是否有进行中的运行（决定显示“运行”还是“停止”） */
  active: boolean;
  /** 预览区正在显示（或等着显示）这个项目 */
  previewing: boolean;
  /** 正在等管理进程回应，按钮暂时不可点 */
  busy: boolean;
  /** 备注，没写是空串 */
  note: string;
  templateId: string;
  /** 模板的显示名；模板已不在列表里（被删、无效）时是 null，界面退回显示模板 id */
  templateName: LocalizedText | null;
  /** 此刻占着的端口（进行中的运行用实际端口）；没有端口的脚本是 null */
  port: number | null;
  /** enabled 为 false 就是“已保留”（术语表）；开启时 days 是设定的天数，协议没给时是 null */
  autoClean: { enabled: boolean; days: number | null };
  /** “剩 N 天”的起点：任何一次使用（标签页打开、命令行运行）都会重置它 */
  lastUsedAt: number;
  /** 上次打开；从没打开过是 null */
  lastOpenedAt: number | null;
  createdBy: CreatedBy;
  createdAt: number;
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
  kind: RunKind;
  /** 最近一次运行的持有者是这个标签页（关闭标签页会停止它）；命令行持有的运行只是被查看 */
  ownedByTab: boolean;
  /** 模板的显示名（运行条上项目名后面的那一小段）；模板已不在列表里是 null */
  templateName: LocalizedText | null;
  /** 此刻占着的端口；没有端口（脚本）或没运行是 null */
  port: number | null;
  /** 最近一次运行的开始时间；从没运行过是 null（脚本运行中用它算“已 N 秒”） */
  startedAt: number | null;
  /** 最近一次运行的退出码和耗时（脚本跑完后显示）；没有就是 null */
  exitCode: number | null;
  durationMs: number | null;
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
  /** 正在等用户确认的“关闭运行中的标签页”；没有是 null（规格 DESKTOP-WORKSPACE-04） */
  closeRequest: { id: string; name: string } | null;
  error: DesktopError | null;
}
