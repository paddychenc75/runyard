// 集成终端的共享类型（规格 desktop/terminal）：界面、主进程、pty-host 三方都按这里说话。
// 这里只有代码和数据，没有给人看的句子：“终端已结束（退出码 N）”之类的文字由界面经文案包生成。

/** 回滚缓冲保留的行数（规格 DESKTOP-TERMINAL-21） */
export const SCROLLBACK_LINES = 10_000;

/**
 * 每个终端的环境里带这个变量（值是随机的，一个终端一个）：它的 shell 以及 shell 启动的一切命令都继承它，
 * 所以结束终端时能按它找到连脱离进程组的后代（nohup、setsid 之类）一起收拾，不留进程（规格 DESKTOP-TERMINAL-27）。
 */
export const TERMINAL_MARKER_ENV = "RUNYARD_TERMINAL";

/** 登录 shell 起不来时改用的系统自带 shell */
export const FALLBACK_SHELL = "/bin/zsh";

/** 登录 shell 没能启动的原因（不是句子，界面按代码选文案） */
export type ShellFailure = "not-found" | "not-executable" | "spawn-failed" | "exited-early";

/** 改用 /bin/zsh 时附带的说明：终端第一行要写“没能启动哪个 shell 和原因”（规格 DESKTOP-TERMINAL-11） */
export interface ShellNotice {
  code: "SHELL_FALLBACK";
  shell: string;
  reason: ShellFailure;
}

/** 终端为什么结束了 */
export type TerminalEnd =
  /** shell 自己退出（如 exit）；exitCode 为 null 是被信号结束 */
  | { reason: "exited"; exitCode: number | null }
  /** 负责终端的后台进程意外结束 */
  | { reason: "host-crashed" }
  /** 项目改名，终端被先关掉（规格 DESKTOP-TERMINAL-34） */
  | { reason: "renamed" }
  /** 后台进程里一个 shell 都没能起来 */
  | { reason: "start-failed" };

/** 一个项目的终端此刻的状态；从没打开过是 none */
export type TerminalState =
  | { kind: "none" }
  | { kind: "running"; pid: number; shell: string; notice?: ShellNotice }
  | ({ kind: "ended" } & TerminalEnd);

export interface TerminalSize {
  cols: number;
  rows: number;
}

/** 界面接上终端时拿到的现状：状态加此前记下的全部输出（最近 SCROLLBACK_LINES 行） */
export interface TerminalSnapshot {
  state: TerminalState;
  /** 回放用的输出；终端没起来是空串 */
  output: string;
}

/** 终端里此刻在运行的命令；空闲在提示符是 null（规格 DESKTOP-TERMINAL-28、29） */
export interface TerminalForeground {
  command: string | null;
}

/** 项目的终端现状：开着（shell 在运行）与否，和里面正在运行的命令（空闲是 null） */
export interface TerminalStatus {
  open: boolean;
  command: string | null;
}

/** 一个终端里此刻在运行的命令 */
export interface TerminalBusy {
  project: string;
  command: string;
}

export interface TerminalDataEvent {
  project: string;
  data: string;
}

export interface TerminalStateEvent {
  project: string;
  state: TerminalState;
}

export interface TerminalMethods {
  /** 第一次点“终端”：没有就创建（工作目录是项目文件夹），有就接上；返回现状和已记下的输出，之后新输出走 terminal.data */
  "terminal.open": { param: { project: string } & TerminalSize; result: TerminalSnapshot };
  /** 只接上已有的终端，不创建（切回标签页时用）；没有终端是 none */
  "terminal.attach": { param: { project: string }; result: TerminalSnapshot };
  /** 界面不再显示这个终端：命令照常运行、输出照常记录 */
  "terminal.detach": { param: { project: string }; result: undefined };
  "terminal.write": { param: { project: string; data: string }; result: undefined };
  "terminal.resize": { param: { project: string } & TerminalSize; result: undefined };
  /** 界面已经处理完这么多输出（字符数）：流控靠它，不回执主进程就会让 shell 暂停输出 */
  "terminal.ack": { param: { project: string; length: number }; result: undefined };
  /** ⌘K：清掉记下的输出（回滚内容），shell 不受影响 */
  "terminal.clear": { param: { project: string }; result: undefined };
  /** 终端已结束后“重新打开终端”：在项目文件夹里开新的，旧内容不留 */
  "terminal.reopen": { param: { project: string } & TerminalSize; result: TerminalSnapshot };
  /** 终端里有没有命令在运行，是哪个 */
  "terminal.foreground": { param: { project: string }; result: TerminalForeground };
  /** 这个项目有没有开着的终端、里面在运行什么命令：改名和移到废纸篓的说明靠它（规格 DESKTOP-TERMINAL-34 至 36） */
  "terminal.status": { param: { project: string }; result: TerminalStatus };
  /** 所有终端里在运行命令的项目和命令名：⌘Q 的确认要列出来（规格 DESKTOP-TERMINAL-30） */
  "terminal.busy": { param: undefined; result: TerminalBusy[] };
}
export type TerminalMethod = keyof TerminalMethods;

export const terminalMethodNames: readonly TerminalMethod[] = [
  "terminal.open",
  "terminal.attach",
  "terminal.detach",
  "terminal.write",
  "terminal.resize",
  "terminal.ack",
  "terminal.clear",
  "terminal.reopen",
  "terminal.foreground",
  "terminal.status",
  "terminal.busy",
];

export interface TerminalEvents {
  /** 终端有新输出（只给已接上的界面） */
  "terminal.data": TerminalDataEvent;
  /** 终端状态变了：启动、结束、意外结束 */
  "terminal.state": TerminalStateEvent;
}
export type TerminalEventName = keyof TerminalEvents;

export const terminalEventNames: readonly TerminalEventName[] = ["terminal.data", "terminal.state"];
