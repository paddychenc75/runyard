import { randomBytes } from "node:crypto";
import type { Env, Platform } from "@runyard/platform";
import { type ClientKind, NONCE_BYTES, PROTOCOL_VERSION } from "@runyard/protocol";
import { type ClientClock, createSystemClock } from "./client-clock.ts";

// 连接管理进程要的全部输入。平台、时钟、随机数都由调用方传进来，包内不读 ~、不读环境变量。

export interface ClientIdentity {
  kind: ClientKind;
  /** 产品版本；拉起新管理进程时原样传给它的 --version */
  version: string;
  /** 构建标识；版本表靠它判断管理进程是不是“自己这一份” */
  build: string;
  /** 缺省是当前进程号 */
  pid?: number;
}

export interface LaunchConfig {
  /**
   * 启动管理进程的命令前缀，如 [process.execPath, <管理进程入口文件>]。
   * client 不能导入 supervisor（layers.json），入口位置由调用方（命令行、桌面应用）给；
   * client 在后面补上 --home --version --build --started-by 等参数（只走命令行参数，不用环境变量）
   */
  command: readonly string[];
  /** 缺省由入口按自己是不是 Electron 判断 */
  host?: "electron" | "node";
  /** 原样作为子进程的环境（应用里要带 ELECTRON_RUN_AS_NODE）。缺省为空 */
  env?: Env;
  /** 开发版：与建 platform 时的 profile 一致 */
  profile?: "dev";
}

export interface ConnectTimeouts {
  /** 单次连接的上限 */
  connectMs: number;
  /** 握手里等对方一条消息的上限 */
  handshakeMs: number;
  /** 拉起管理进程之后等它能连上的总上限（规格 SUPERVISOR-LIFECYCLE-10） */
  launchMs: number;
  /** 请旧管理进程退出之后，等它真的退出（锁释放）的上限 */
  replaceMs: number;
}

export const DEFAULT_TIMEOUTS: ConnectTimeouts = {
  connectMs: 1000,
  handshakeMs: 3000,
  launchMs: 3000,
  replaceMs: 5000,
};

/** 拉起之后重连的间隔：50、100、200 毫秒，之后每次 200，直到总上限 */
export const RECONNECT_BACKOFF_MS = [50, 100, 200] as const;

export interface ConnectOptions {
  platform: Platform;
  client: ClientIdentity;
  launch: LaunchConfig;
  /** 本客户端的协议版本和要求管理进程至少是的版本；缺省都是当前协议版本，测试里用来模拟别的版本 */
  protocol?: { protocol: number; minProtocol: number };
  clock?: ClientClock;
  timeouts?: Partial<ConnectTimeouts>;
  /** 返回恰好 32 个随机字节的小写十六进制；测试里可以换成确定的 */
  newNonce?: () => string;
  /** 只给开发者的诊断行（丢弃了的事件之类），客户端自己从不打印 */
  onDiagnostic?: (line: string) => void;
}

export interface ResolvedOptions {
  platform: Platform;
  client: Required<ClientIdentity>;
  launch: LaunchConfig;
  protocol: number;
  minProtocol: number;
  clock: ClientClock;
  timeouts: ConnectTimeouts;
  newNonce: () => string;
  onDiagnostic: (line: string) => void;
}

export function resolveOptions(options: ConnectOptions): ResolvedOptions {
  return {
    platform: options.platform,
    client: { ...options.client, pid: options.client.pid ?? process.pid },
    launch: options.launch,
    protocol: options.protocol?.protocol ?? PROTOCOL_VERSION,
    minProtocol: options.protocol?.minProtocol ?? PROTOCOL_VERSION,
    clock: options.clock ?? createSystemClock(),
    timeouts: { ...DEFAULT_TIMEOUTS, ...options.timeouts },
    newNonce: options.newNonce ?? (() => randomBytes(NONCE_BYTES).toString("hex")),
    onDiagnostic: options.onDiagnostic ?? (() => {}),
  };
}
