import type { Locale } from "@runyard/i18n";
import type { CreatedBy, ErrorCode, LocalizedText, RunKind, RunState } from "@runyard/protocol";

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
  templates: TemplateRow[];
  error: DesktopError | null;
}
