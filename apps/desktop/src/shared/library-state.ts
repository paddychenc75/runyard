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
