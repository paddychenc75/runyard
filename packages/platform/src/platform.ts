import type { Server, Socket } from "node:net";
import type { Readable, Writable } from "node:stream";
import type { ComputeProof, EnvSource } from "@runyard/protocol";
import type { AbsPath, PosixRelPath } from "./path-types.ts";

// 平台接口：系统差异的唯一出口（技术设计 §7.1，决策记录 0003、0013，docs/architecture/platform-interface.md）。
// 业务代码只调用这个接口。接口按决策记录 0005 到 0010 里量到的 Windows 行为设计，不假定 POSIX：
// 没有信号和进程组，进程身份是 pid 加启动时间，停止只说“想要的方式”，手段由实现决定，
// 废纸篓可以失败而不是永久删除，连接点是不透明的地址。
//
// 写法约束（platform-contract 检查靠它解析成员）：`Platform` 里每个分组都是内联的对象类型，
// 每个成员单独声明；加成员就必须同时在契约测试里加对应的用例（src/contract/）。

export type PlatformId = "darwin" | "win32" | "linux";
export type Arch = "x64" | "arm64";
export type Env = Readonly<Record<string, string>>;
export type ToolId = string;

/** 用后要释放的东西。dispose 完成时系统资源已经交还，调用方可以立刻改名、删除 */
export interface Disposable {
  dispose(): Promise<void>;
}

/** 进程身份：pid 加启动时间。pid 会被系统复用，只凭 pid 认进程会杀错（决策记录 0006 的 K2 事故） */
export interface ProcRef {
  readonly pid: number;
  /**
   * 启动时间，毫秒。同一台机器上同一个进程总是同一个值；只比较是否相等或先后，不做别的算术。
   * 起点由实现决定（macOS 是 Unix 纪元，精度到秒；Linux 是开机时刻，精度 10 毫秒），不要拿它当墙上时间
   */
  readonly startTime: number;
}

export interface ExitInfo {
  /** 退出码；进程被系统强行结束、没有退出码时为 null。接口不暴露信号名 */
  readonly exitCode: number | null;
}

export interface ManagedProcess {
  readonly ref: ProcRef;
  readonly stdin: Writable | null;
  readonly stdout: Readable;
  readonly stderr: Readable;
  /** 只等进程的退出，不等输出管道关闭（决策记录 0006） */
  readonly exited: Promise<ExitInfo>;
}

/** 校验名称得出的问题，是代码不是句子。reserved 对应 NAME_RESERVED，其余对应 NAME_INVALID */
export type NameProblem =
  | "empty"
  | "too-long"
  | "invalid-chars"
  | "edge-hyphen"
  | "trailing-dot-or-space"
  | "reserved";

export type LengthVerdict = "ok" | "near-limit" | "too-long";
export type PortStatus = "free" | "in-use" | "reserved";
export type TerminateMode = "graceful" | "interrupt" | "kill";

export interface TrashResult {
  /** 项目进了废纸篓或回收站后，用户能不能从系统里“放回原处” */
  readonly restorable: boolean;
  /** 因为可再生（regenerable）而被直接删除、没有进废纸篓的子路径（macOS 恒为空） */
  readonly removedDirectly: readonly PosixRelPath[];
}

export interface WatchOptions {
  /** 忽略的子路径（相对 root），其下的变化不报告 */
  readonly ignore?: readonly PosixRelPath[];
  /** 往下看几层：1 只看 root 的直接子项，缺省看全部（管理进程监听资源库根目录只要一层） */
  readonly depth?: number;
}

export interface WatchEvent {
  readonly kind: "add" | "change" | "remove";
  readonly path: PosixRelPath;
}

export interface ToolCandidate {
  readonly path: AbsPath;
  /** 在 PATH 里找到的，还是在固定的常见安装位置找到的（后者只是解析失败时的临时答案） */
  readonly origin: "env-path" | "known-location";
}

export interface ShellInfo {
  readonly path: AbsPath;
  readonly name: string;
}

export interface EnvLoadResult {
  readonly env: Record<string, string>;
  readonly source: EnvSource;
  readonly ms: number;
}

export interface Platform {
  readonly id: PlatformId;
  readonly arch: Arch;
  readonly caps: {
    /** 停止进程树时能不能先“礼貌地请求退出”；none 表示只能强制结束（不写信号名） */
    readonly gracefulStop: "graceful" | "none";
    readonly cloneCopy: boolean;
    readonly symlinks: boolean;
    /** 进程是否运行在限制文件访问的系统沙箱里 */
    readonly sandbox: boolean;
  };
  readonly paths: {
    readonly home: AbsPath;
    /** 状态目录（`~/.runyard`，开发版 `~/.runyard-dev`） */
    readonly stateDir: AbsPath;
    readonly defaultLibrary: AbsPath;
    /** 所有系统一致：保留名、末尾的点和空格都拒绝，这样资源库以后能搬到 Windows */
    validateName(name: string): NameProblem | null;
    checkLength(p: AbsPath): LengthVerdict;
    /** 在网盘同步目录下（iCloud 云盘、Dropbox 等）：选资源库位置时给警告 */
    isCloudSynced(p: AbsPath): boolean;
    /** 在“桌面”“文档”“下载”之内：系统读这些文件夹会弹权限框并一直等待 */
    isInUserFolders(p: AbsPath): boolean;
    /** 整条路径的上限（字节，含结尾的 NUL）。checkLength 以它为界，提示里要给用户看数字时用它 */
    readonly maxPathLength: number;
  };
  readonly env: {
    load(opts?: { refresh?: boolean; cwd?: AbsPath }): Promise<EnvLoadResult>;
    runDefaults(): Record<string, string>;
  };
  readonly exec: {
    which(name: string, env: Env, cwd: AbsPath): Promise<AbsPath | null>;
    spawn(spec: { argv: string[]; cwd: AbsPath; env: Env; stdin: boolean }): ManagedProcess;
    /**
     * 启动一个与调用者脱钩的进程：调用者退出、被强杀、终端被关，它都继续活着。
     * “脱钩”包含最强的情形——调用者在“关闭即杀”的作业里（Windows 的 Job Object）也要活下来；
     * 怎样做到是各系统实现自己的事，接口没有选项，调用方不挑启动方式（决策记录 0005 第 4 条、0013）。
     * 输出追加到 logFile，不继承标准输入输出，工作目录是状态目录，环境原样用 env
     */
    spawnDetached(argv: string[], opts: { env: Env; logFile: AbsPath }): Promise<{ pid: number }>;
  };
  readonly proc: {
    /** 停整棵进程树。先核对 pid 和启动时间，对不上就什么也不做（进程不是我们的了） */
    terminate(p: ProcRef, o: { mode: TerminateMode; graceMs: number }): Promise<void>;
    members(p: ProcRef): Promise<number[]>;
    /** 取一个 pid 现在的启动时间；进程不存在返回 null */
    identity(pid: number): Promise<{ startTime: number } | null>;
  };
  readonly ports: {
    isFree(port: number): Promise<PortStatus>;
    occupant(port: number): Promise<{ pid: number; name: string } | null>;
    connections(port: number): Promise<number>;
    loopbackOnly(port: number): Promise<boolean>;
  };
  readonly fs: {
    /** 文件不存在或不是文件返回 null。UTF-8 解码 */
    readText(file: AbsPath): Promise<string | null>;
    /** 目录下一层的子目录名，排好序；目录不存在返回空数组 */
    listDirs(dir: AbsPath): Promise<string[]>;
    exists(path: AbsPath): Promise<boolean>;
    /** 连同缺的上级目录一起建；已存在不报错 */
    makeDir(dir: AbsPath): Promise<void>;
    /** 直接写（不是原子的），父目录必须已存在，已有同名文件就覆盖。要求不能写坏的文件用 writeAtomic */
    writeFile(file: AbsPath, data: string | Uint8Array): Promise<void>;
    /** 改文件名；目标已存在抛 NAME_EXISTS，不覆盖 */
    renameFile(from: AbsPath, to: AbsPath): Promise<void>;
    /**
     * 同一个卷里改名（项目文件夹改名），不退到复制再删除。
     * 目标已存在抛 NAME_EXISTS（空目录也算，目标原样）；原目录不在抛 FOLDER_MISSING；
     * 目录被占用或权限不足抛 PATH_LOCKED，原目录保持原样
     */
    moveDir(from: AbsPath, to: AbsPath): Promise<void>;
    /** 只进废纸篓或回收站，放不进就失败（TRASH_UNAVAILABLE），绝不退到永久删除 */
    trash(dir: AbsPath, opts?: { regenerable?: PosixRelPath[] }): Promise<TrashResult>;
    /**
     * 先写同一目录下的临时文件、刷到磁盘，再改名盖掉目标：中途出错或掉电，旧文件完好，不留半个文件。
     * private 为 true 时只有本人能读写（口令、私有状态）；缺省沿用已有文件的权限，新文件按普通文件
     */
    writeAtomic(file: AbsPath, data: string, opts?: { private?: boolean }): Promise<void>;
  };
  watch(root: AbsPath, opts: WatchOptions, cb: (events: WatchEvent[]) => void): Promise<Disposable>;
  readonly ipc: {
    /** 不透明的地址：调用方只传递，不解析。路径超过系统上限抛 PATH_TOO_LONG */
    endpoint(): string;
    /**
     * 拿到“只许一个监听者”的内核锁再监听；别的进程已持有锁抛 BUSY（说明已经有一个管理进程）。
     * 返回的服务器 close 时锁一并释放；进程死亡时由系统释放
     */
    listen(): Promise<Server>;
    /** 连不上（没有监听者、权限不够、超时）一律抛 SUPERVISOR_UNAVAILABLE */
    connect(timeoutMs: number): Promise<Socket>;
    /** 握手的证明函数：HMAC-SHA256(key, message)，小写十六进制（protocol 的 ComputeProof） */
    computeProof: ComputeProof;
    /** 常量时间比较证明；格式不对（不是 64 个小写十六进制字符）直接 false */
    verifyProof(key: Uint8Array, message: string, proof: string): boolean;
  };
  readonly tools: {
    candidates(tool: ToolId, env: Env): Promise<ToolCandidate[]>;
    packageManagers(): Promise<string[]>;
  };
  readonly shell: {
    /** 第一个是默认值 */
    interactive(env: Env): Promise<ShellInfo[]>;
  };
  readonly desktop: {
    reveal(p: AbsPath): Promise<void>;
    openTerminalAt(dir: AbsPath): Promise<void>;
    openInEditor(dir: AbsPath, editor: string): Promise<void>;
  };
  readonly cli: {
    installShim(source: AbsPath): Promise<{ path: string; onPath: boolean }>;
  };
}
