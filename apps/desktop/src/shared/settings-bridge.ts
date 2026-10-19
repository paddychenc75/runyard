import type { Settings, SettingsPatch, ToolchainReport } from "@runyard/protocol";

// 设置页对界面暴露的类型（规格 desktop/settings）。设置本身的形状在协议包，这里只有设置页多出来的几个动作。

/** 本机找到的外部编辑器；id 存进设置的 externalEditor，name 是它自己的名字（不翻译） */
export interface ExternalEditorOption {
  id: string;
  name: string;
}

/** 用户在文件夹选择器里选的新资源库位置 */
export interface LibraryRootChoice {
  /** 绝对路径，写进设置的就是它 */
  path: string;
  /** 主目录缩成 ~ 的写法，给确认框显示 */
  display: string;
  /** 在“桌面”“文档”“下载”之内：改之前要先警告会触发系统的隐私权限弹窗 */
  protectedFolder: boolean;
}

/** 本机配置里的镜像源和代理（~/.npmrc）；没有就不写。设置里没单独指定时，输入框显示它（规格 DESKTOP-SETTINGS-13） */
export interface LocalNetwork {
  registry?: string;
  proxy?: string;
}

/** “指定路径…”的结果：选了文件并被接受、取消、或文件不是可用的工具（原来的路径没动） */
export type PickToolPathResult =
  | { status: "set"; report: ToolchainReport }
  | { status: "cancelled" }
  | { status: "invalid"; tool: string; path: string }
  | { status: "failed" };

/** `runyard` 命令的状态（规格 DESKTOP-SETTINGS-20、21）。从源码运行没有随包的命令行，状态是 unavailable */
export interface CliCommandStatus {
  state: "unavailable" | "missing" | "installed" | "stale" | "conflict";
  /** 链接的位置（主目录缩成 ~）；unavailable 时没有 */
  path?: string;
  /** 命令行的版本，与应用相同 */
  version: string;
  /** 链接所在目录在不在登录 shell 的 PATH 上；只有 installed 才有意义 */
  onPath: boolean;
  /** 加入 PATH 的一行命令，只展示和复制，应用不会替用户改 shell 配置 */
  pathCommand: string;
}

export interface CliLinkOutcome {
  /** conflict：那个位置已有别的文件，没有动它；failed：别的原因没建成 */
  result: "done" | "conflict" | "failed";
  status: CliCommandStatus;
}

export interface DiagnosticsOutcome {
  ok: boolean;
}

/** 技能包写在哪些智能体的目录里（claude：~/.claude/skills，agents：~/.agents/skills，Codex 等读这一份） */
export interface AgentSkillStatus {
  claude: boolean;
  agents: boolean;
}
export type AgentSkillTarget = keyof AgentSkillStatus;

/**
 * 后台管理进程：是否在运行，命令行持有的运行个数（“运行中 · N 个由命令行启动”），
 * 以及标签页持有的运行个数（停止管理进程时它们也会停，确认框要写明）
 */
export interface SupervisorStatus {
  running: boolean;
  cliRuns: number;
  tabRuns: number;
}

export interface SettingsMethods {
  /** 显示主窗口并导航到设置页面；不改变项目选择。 */
  "settings.open": { param: undefined; result: undefined };
  "settings.pageActive": { param: boolean; result: undefined };
  "settings.get": { param: undefined; result: Settings };
  /** 只传要改的字段；返回改后的全部设置。不合法的值主进程拒绝（返回改之前的设置） */
  "settings.set": { param: SettingsPatch; result: Settings };
  /** 本机找到的外部编辑器，按固定顺序 */
  "settings.editors": { param: undefined; result: ExternalEditorOption[] };
  /** 弹出文件夹选择器；取消是 null */
  "settings.pickLibraryRoot": { param: undefined; result: LibraryRootChoice | null };
  /** 在访达里显示当前资源库文件夹 */
  "settings.revealLibraryRoot": { param: undefined; result: undefined };
  /** 用设置里的外部编辑器打开项目文件夹；没选编辑器时用系统默认打开 */
  "playground.openInEditor": { param: string; result: undefined };
  /** 本机 ~/.npmrc 里的镜像源和代理 */
  "settings.localNetwork": { param: undefined; result: LocalNetwork };
  /** 运行环境表：cachedOnly 只读缓存，立即返回；否则实时检测。只列已有模板用到的工具 */
  "toolchain.check": { param: { cachedOnly: boolean }; result: ToolchainReport };
  "toolchain.recheck": { param: undefined; result: ToolchainReport };
  /** 弹出文件选择器选这个工具的可执行文件，能读出版本号才接受 */
  "toolchain.pickPath": { param: string; result: PickToolPathResult };
  /** 校验并保存输入的完整可执行文件路径，失败不改变已生效路径 */
  "toolchain.setPath": { param: { tool: string; path: string }; result: PickToolPathResult };
  /** 在终端里运行这个工具的安装命令：只运行上一次检测结果里报告的那一条，不接受别的内容 */
  "toolchain.runInstall": { param: string; result: undefined };
  "cli.status": { param: undefined; result: CliCommandStatus };
  "cli.install": { param: undefined; result: CliLinkOutcome };
  "cli.remove": { param: undefined; result: CliLinkOutcome };
  "diagnostics.export": { param: undefined; result: DiagnosticsOutcome };
  "agents.openGuide": { param: "en" | "zh-CN"; result: { ok: boolean } };
  "agents.status": { param: undefined; result: AgentSkillStatus };
  "agents.install": { param: AgentSkillTarget; result: AgentSkillStatus };
  "supervisor.status": { param: undefined; result: SupervisorStatus };
  /** 停止命令行持有的运行并让管理进程退出（界面已确认） */
  "supervisor.stop": { param: undefined; result: SupervisorStatus };
}
export type SettingsMethod = keyof SettingsMethods;

export const settingsMethodNames: readonly SettingsMethod[] = [
  "settings.open",
  "settings.pageActive",
  "settings.get",
  "settings.set",
  "settings.editors",
  "settings.pickLibraryRoot",
  "settings.revealLibraryRoot",
  "playground.openInEditor",
  "settings.localNetwork",
  "toolchain.check",
  "toolchain.recheck",
  "toolchain.pickPath",
  "toolchain.setPath",
  "toolchain.runInstall",
  "cli.status",
  "cli.install",
  "cli.remove",
  "diagnostics.export",
  "agents.openGuide",
  "agents.status",
  "agents.install",
  "supervisor.status",
  "supervisor.stop",
];
