import type { Locale } from "@runyard/i18n";
import type {
  CreatedBy,
  ErrorCode,
  LocalizedText,
  PortFallbackReason,
  RunKind,
  RunState,
  TemplateCategory,
} from "@runyard/protocol";

// 主进程交给界面的全部数据。只有可序列化的普通对象：界面进程没有 Node，
// 也拿不到连接管理进程的客户端，只能看到这一份状态和 DesktopBridge 里的几个动作。

/** 项目文件夹的磁盘占用（管理进程后台算，规格 LIBRARY-DISK-USAGE） */
export interface RowSize {
  /** 总大小，含依赖目录和 .runyard */
  totalBytes: number;
  dependencyBytes: number;
  /** 找到的依赖目录名 */
  dependencyDirs: string[];
  /** 没有权限读取、没计入的文件夹个数；大于 0 就是“不完整” */
  unreadable: number;
}

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
  /** 找不到项目文件夹（被移走或删除）：资源库的“有问题”筛选要用 */
  missing: boolean;
  /** 磁盘占用；没给或 null 是还在计算（找不到文件夹的看 missing，没有大小） */
  size?: RowSize | null;
  /** 文件夹的显示写法（主目录缩成 ~）：找不到文件夹的说明里写原路径；没给就用 path */
  folder?: string;
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
  /** 脚本：保存了有语法错误的代码，没有重新运行，显示的是上一次的输出（规格 DESKTOP-WORKSPACE-35） */
  stale: boolean;
  /** 脚本项目自己的“保存后自动运行”开关；没写过就是开（规格 run/scripts） */
  scriptAutoRun: boolean;
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
  /** 启动超过 30 秒仍未就绪：状态不变，只标“较慢”，不是失败（规格 DESKTOP-WORKSPACE-20） */
  slow: boolean;
  /**
   * 启动没成功的原因（代码加参数，文字在界面生成）：缺工具、依赖安装失败等；没有失败是 null。
   * 缺工具的参数（工具、版本、模板自己写的安装命令和链接）只在启动请求的错误响应里，
   * 应用重开后拿不到，那时是 null，预览区退回“已停止”加“运行”
   */
  failure: DesktopError | null;
  /** 端口被占用、本次改用了别的端口；没有改用是 null */
  portFallback: TabPortFallback | null;
  /** 崩溃前预览的最后一帧（PNG 的 data 地址）；没有是 null */
  lastFrame: string | null;
  /**
   * 最近一次运行由命令行持有且仍在进行：标签页只是查看它（规格 DESKTOP-WORKSPACE-48）；
   * 不是时为 null。agent 是智能体名称，命令行没写就是 null
   */
  attached: { agent: string | null; startedAt: number } | null;
  /** 入口文件（项目内相对路径）：第一次打开项目时编辑器先打开它；项目没有记录是 null */
  entry: string | null;
  /** 项目文件夹的显示写法（主目录缩成 ~），启动进度画面的说明里用 */
  folder: string;
  /** 启动清单里各步已用的时间；这一步没跑完或没量到是 null */
  phaseMs: StartPhaseMs;
  /** 服务类项目（模板类型是“服务”）：右侧是请求面板而不是网页预览（规格 DESKTOP-REQUEST-PANEL-01）；没给就是 false */
  service?: boolean;
  /** 请求面板“服务重载后自动重发”的开合，按项目记住；没给就是开（规格 DESKTOP-REQUEST-PANEL-15） */
  requestAutoResend?: boolean;
  /** 最近一次运行此刻的进程号；服务重载会换进程，界面没看到“重新加载中”时靠它发现（规格 DESKTOP-REQUEST-PANEL-16）；没有是 null */
  pid?: number | null;
  /** 找不到项目文件夹：标签页不启动，显示“找不到文件夹”的说明（规格 DESKTOP-LIBRARY-VIEW“找不到项目文件夹”）；没给就是 false */
  missing?: boolean;
}

/** 启动清单里已经走完的步骤各用了多久（毫秒）；时间由主进程按事件到达量出，管理进程不记 */
export interface StartPhaseMs {
  copy: number | null;
  install: number | null;
  start: number | null;
}

/** 预览区上方的“端口已自动改用”说明：原端口为什么用不了、现在用哪个（规格 DESKTOP-WORKSPACE-22） */
export interface TabPortFallback {
  wanted: number;
  actual: number;
  reason: PortFallbackReason;
  /** 占用者；查不到是 null */
  occupant: { pid: number; name: string } | null;
}

/** 运行视图（“N 个运行中”弹层）里的一行：一个仍在进行的运行 */
export interface RunningRow {
  runId: string;
  /** 项目 id */
  id: string;
  name: string;
  templateName: LocalizedText | null;
  port: number | null;
  startedAt: number;
  /** 来源：标签页，或命令行（带智能体名称，没写是 null）；命令行持有的“空闲后自动停止” */
  source: { kind: "tab" } | { kind: "cli"; agent: string | null };
}

export interface TemplateRow {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  category: TemplateCategory;
  /** 带 unmaintained 标签：选择器里第二行画成警示色（TEMPLATES-FORMAT-54） */
  unmaintained: boolean;
}

/** 错误只带“代码加参数”，句子由界面用文案包生成 */
export interface DesktopError {
  code: ErrorCode;
  params: Record<string, unknown>;
}

/** 自动清理提示条里的一项（规格 DESKTOP-LIBRARY-VIEW-57） */
export interface CleanReminderItem {
  id: string;
  name: string;
  /** 已经几天没打开 */
  idleDays: number;
}

/** 智能体经命令行创建并运行了项目：右下角的提示（规格 DESKTOP-LIBRARY-VIEW-54） */
export interface AgentRunNotice {
  kind: "agent-run";
  id: string;
  playgroundId: string;
  name: string;
  /** 智能体名称；命令行没写是 null */
  agent: string | null;
  /** 运行的地址；还没有端口是 null */
  url: string | null;
  at: number;
}

/** 创建成功但路径接近系统上限的提示（规格 LIBRARY-PLAYGROUNDS-05 的界面一侧） */
export interface PathNearLimitNotice {
  kind: "path-near-limit";
  id: string;
  name: string;
  length: number;
  limit: number;
}

/** 链接没能照做时给的一句提示（规格 DESKTOP-LINKS-03、04、10、11、14、16）：代码加一个值，句子由界面生成 */
export type LinkNoticeCode =
  | "open-missing"
  | "open-invalid"
  | "new-no-template"
  | "new-name-invalid"
  | "new-name-taken"
  | "new-busy"
  | "new-throttled"
  | "new-failed"
  | "link-invalid";

export interface LinkNotice {
  kind: "link";
  id: string;
  code: LinkNoticeCode;
  /** 提示里要写的名称或模板；没有是 null */
  value: string | null;
}

export type AppNotice = AgentRunNotice | PathNearLimitNotice | LinkNotice;

/** runyard://new 的确认框内容（设计稿 UrlConfirm，规格 DESKTOP-LINKS-06、07、13） */
export interface LinkConfirmView {
  /** 链接自称的来源；没带是 null（写“未知来源”） */
  source: string | null;
  /** 链接是从这个项目的预览页里发出的；不是是 null */
  fromProject: string | null;
  template: { id: string; name: LocalizedText };
  name: string;
  /** 新项目的文件夹，写成 ~/… 的样子 */
  folder: string;
}

/** “有新版本”提示条（设计稿 UpdateBanner，规格 DESKTOP-SETTINGS-26） */
export interface UpdateBannerView {
  latest: string;
  current: string;
}

export interface LibraryState {
  locale: Locale;
  playgrounds: PlaygroundRow[];
  /** 打开的项目标签，按打开顺序；资源库标签固定在最前，不在这里 */
  tabs: TabRow[];
  /** 当前标签："library" 或项目 id */
  activeTab: string;
  templates: TemplateRow[];
  /** 全部模板的个数（内置加用户的，无效的也算）：侧栏“模板”右边的数；没给就用 templates 的个数 */
  templateCount?: number;
  /** 仍在进行的运行（标签页和命令行持有的），标签页持有的在前；已结束的脚本不在其中 */
  runs: RunningRow[];
  /** 第一次从管理进程读到资源库之后为 true；之前的空列表不代表资源库是空的（#298） */
  loaded: boolean;
  /** 最近用来创建过项目的模板 id，最近的在前、不重复；只含此刻仍在 templates 里的 */
  recentTemplates: string[];
  /** 正在等用户确认的“关闭运行中的标签页”；没有是 null（规格 DESKTOP-WORKSPACE-04） */
  closeRequest: {
    id: string;
    name: string;
    /** 这个项目的终端里还在运行的命令名（规格 DESKTOP-TERMINAL-29）；终端空闲或没开时没有这一项 */
    terminalCommand?: string;
    /** 关闭会不会停止运行：只有终端在运行命令而运行本身没人持有时是 false；有 terminalCommand 时才给 */
    stopsRun?: boolean;
  } | null;
  error: DesktopError | null;
  /** 资源库文件夹，主目录缩成 ~（新建弹窗的“文件夹：…”提示）；还没读到是空串 */
  libraryRoot: string;
  /** 资源库在网盘同步目录下（iCloud、Dropbox 等）：新建弹窗给警告；没给就是 false。下面四项都是主进程新加的，没给按空处理（不破坏手工拼状态的测试） */
  libraryRootSynced?: boolean;
  /** 自动清理提示条要列出的项目（离到期不足一天、没点“稍后再说”）；空就不画提示条 */
  cleanReminder?: CleanReminderItem[];
  /** 离到期不足一天的项目数：Dock 角标写它，“稍后再说”不影响它 */
  cleanDueCount?: number;
  /** 右下角的提示，先来的在前；点关闭或按钮后消失 */
  notices?: AppNotice[];
  /** 待确认的 runyard://new 请求；没有是 null / 不写 */
  linkConfirm?: LinkConfirmView | null;
  /** 资源库页顶部的“有新版本”；没有是 null / 不写 */
  update?: UpdateBannerView | null;
}
