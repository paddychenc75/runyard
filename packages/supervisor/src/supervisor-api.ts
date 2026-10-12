import type { Platform } from "@runyard/platform";
import type { EventData, EventName, ShutdownReason } from "@runyard/protocol";
import type { Session } from "./session.ts";
import type { SupervisorClock } from "./supervisor-clock.ts";

// 管理进程交给后续 issue 的能力：发事件、告知运行个数变了、看会话。
// 运行编排（#40）、资源库与设置（#41）、日志（#43）拿它接上，不需要碰 supervisor 的内部类型。
export interface SupervisorApi {
  readonly platform: Platform;
  readonly clock: SupervisorClock;
  /** 发给所有订阅了该事件所属主题的会话 */
  publish<E extends EventName>(event: E, data: EventData<E>): void;
  /**
   * 运行个数可能变了：重新判断要不要开始空闲计时。
   * 没有这个通知，空闲退出只会在下一次连接变化时才重新判断
   */
  notifyRunsChanged(): void;
  /** 握手完成的会话 */
  readySessions(): readonly Session[];
  /** 请管理进程退出（也是 supervisor.shutdown 走的路径）；重复调用返回同一个 Promise */
  shutdown(reason: ShutdownReason): Promise<void>;
}
