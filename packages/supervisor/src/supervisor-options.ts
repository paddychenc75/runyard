import type { Platform } from "@runyard/platform";
import type { ClientKind, ShutdownReason, SupervisorFile } from "@runyard/protocol";
import type { DiscoveryStore } from "./discovery-file.ts";
import type { HandlerMap } from "./dispatch.ts";
import type { Session, SessionCloseReason } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";
import type { SupervisorClock } from "./supervisor-clock.ts";

export const IDLE_EXIT_MS = 60_000;
// 连上之后必须在这个时间内完成握手，否则断开（防止半开的连接把管理进程一直留着）。技术设计没有给数，取 5 秒
export const HANDSHAKE_TIMEOUT_MS = 5000;
// 关闭管理进程时，等客户端把连接收完的上限；超过就强行断开
export const SHUTDOWN_GRACE_MS = 2000;
// 一个连接上排队待发的事件字节数上限；超过说明客户端读得太慢，断开它
export const MAX_PENDING_EVENT_BYTES = 16 * 1024 * 1024;

export interface SupervisorIdentity {
  /** 协议版本（整数）；发现文件、质询、supervisor.info 里是同一个值 */
  protocol: number;
  /** 本管理进程愿意服务的最低客户端协议版本 */
  minClientProtocol: number;
  /** 产品版本 */
  version: string;
  /** 构建标识：版本号加构建时的随机串（决策记录 0007 第 6 条） */
  build: string;
  /** 谁让它启动的，给 supervisor.info 的 startedBy */
  startedBy: ClientKind;
}

/** 后续 issue 接上来的东西；全部可省，没有就用空实现 */
export interface SupervisorExtensions {
  /** 方法处理函数；不许与 supervisor 自己的方法重名 */
  handlers?: HandlerMap;
  /** 现在有几个运行（口径同 run.state 的 runningCount）；缺省恒为 0 */
  runCount?: () => number;
  /**
   * 崩溃后清理（#42）：核对上次留下的运行记录，结束仍活着的整棵进程树，标 crashed。
   * 在拿到锁、写发现文件之前调用且只调用一次，所以客户端此时还连不上
   */
  recoverCrashedRuns?: () => Promise<void>;
  /** 退出前先做的事（#40：停掉所有运行）；在关闭会话之前等它完成 */
  onShutdown?: (reason: ShutdownReason) => Promise<void>;
  /** 会话的生命周期（#40：持有者、重连宽限期） */
  sessions?: SessionObserver;
}

export interface SessionObserver {
  onReady?(session: Session): void;
  onClosed?(session: Session, reason: SessionCloseReason): void;
  /** session.bye：先于响应；返回后才回响应并关闭连接 */
  onBye?(session: Session): Promise<void>;
}

export interface StartSupervisorOptions {
  /** 状态目录、连接点都来自它；主目录由调用方显式给（getPlatform({ home })），这里不读 `~` */
  platform: Platform;
  identity: SupervisorIdentity;
  /** 写进发现文件：启动者是 Electron 还是 Node，以及它的可执行文件路径 */
  host: SupervisorFile["host"];
  execPath: string;
  /** 以后的 issue 要用到 api（发事件、通知运行个数变化）时用这个形式 */
  extend?: (api: SupervisorApi) => SupervisorExtensions;
  clock?: SupervisorClock;
  /** 发现文件的读写；缺省写真实文件（600，先写临时文件再改名） */
  discovery?: DiscoveryStore;
  /** 返回 n 个随机字节；缺省 node:crypto。测试里换成确定的 */
  randomBytes?: (n: number) => Uint8Array;
  idleExitMs?: number;
  handshakeTimeoutMs?: number;
  maxPendingEventBytes?: number;
  shutdownGraceMs?: number;
  /** 只给开发者看的诊断行（英文）。缺省丢弃 */
  log?: (line: string) => void;
}

export interface SupervisorHandle {
  /** 不透明的连接点 */
  readonly endpoint: string;
  /** 口令，小写十六进制，与发现文件里的一样。测试用；产品代码读发现文件 */
  readonly token: string;
  readonly api: SupervisorApi;
  /** 当前连接个数（含还没握手完成的） */
  connectionCount(): number;
  /** 退出完成（会话已关、发现文件已删、锁已放）时 resolve */
  readonly closed: Promise<void>;
}
