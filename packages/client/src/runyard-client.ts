import {
  type EventData,
  type EventFrame,
  type EventName,
  type EventTopic,
  eventRegistry,
  isEventName,
  type MethodName,
  type MethodParams,
  type MethodResult,
  subscriptionSchema,
} from "@runyard/protocol";
import { callMethod } from "./call-method.ts";
import { clientError } from "./client-error.ts";
import type { Connection } from "./connection.ts";

// 握手和版本比对都通过之后的客户端：带类型的 call、事件订阅、关闭。
// 方法的入参出参类型都来自 protocol 的方法登记表，这里不再写一份。

/** 一条收到的事件。data 的类型随 event 收窄；gap 为 true 表示同一订阅里 seq 跳号，中间丢过事件，应重读快照 */
export type ClientEvent = {
  [E in EventName]: { event: E; data: EventData<E>; seq: number; gap: boolean };
}[EventName];

export type EventListener = (event: ClientEvent) => void;

export interface EventSubscription {
  readonly sub: number;
  /** 取消订阅；连接已经断开时什么也不做 */
  unsubscribe(): Promise<void>;
}

interface Registered {
  listener: EventListener;
  lastSeq: number;
}

/** 版本表（protocol.md 第 5 节）对这次连接的结论，应用据此决定要不要提示 */
export type VersionOutcome =
  // 直接使用（版本和构建标识相同，或管理进程更新但仍兼容）
  | { kind: "current" }
  // 管理进程是旧的，已换成自己带的（没有运行时才会换）
  | { kind: "replaced" }
  // 管理进程是旧的但有运行，沿用了它，没有停任何运行。应用提示“后台管理进程是旧版本，停止全部运行后会自动更新”
  | { kind: "outdated"; reason: "build-differs" | "protocol-older"; runs: number };

/** 管理进程的自我介绍（supervisor.info）加握手里拿到的最低协议要求 */
export interface SupervisorSummary {
  protocol: number;
  minProtocol: number;
  version: string;
  build: string;
  startedBy: "app" | "cli";
  /** 握手时的运行个数 */
  runs: number;
}

export interface ClientMeta {
  supervisor: SupervisorSummary;
  outcome: VersionOutcome;
  /** 这次连接过程中是不是由本客户端拉起了管理进程（含换新） */
  launched: boolean;
  diagnostic: (line: string) => void;
}

export class RunyardClient {
  readonly supervisor: SupervisorSummary;
  readonly outcome: VersionOutcome;
  readonly launched: boolean;
  readonly #connection: Connection;
  readonly #subscriptions = new Map<number, Registered>();
  readonly #diagnostic: (line: string) => void;

  constructor(connection: Connection, meta: ClientMeta) {
    this.#connection = connection;
    this.#diagnostic = meta.diagnostic;
    this.supervisor = meta.supervisor;
    this.outcome = meta.outcome;
    this.launched = meta.launched;
    connection.setEventListener((frame) => this.#onEvent(frame));
  }

  /** 连接关闭（对端退出、被 close()）时兑现 */
  get closed(): Promise<void> {
    return this.#connection.closed;
  }

  /**
   * 调用一个方法。成功返回出参（已按登记表校验），失败抛 ClientError：
   * 管理进程返回的错误原样带着 code 和 params；连接断了是 SUPERVISOR_UNAVAILABLE；
   * 出参不符合登记表是 INTERNAL（管理进程或协议定义的缺陷）。
   */
  async call<M extends MethodName>(method: M, params: MethodParams<M>): Promise<MethodResult<M>> {
    return callMethod(this.#connection, method, params);
  }

  /**
   * 按主题订阅事件。登记发生在响应到达的那一刻，所以紧跟在响应后面的第一个事件也不会丢。
   * 收到登记表里没有的事件名（新版管理进程才有的）或数据不合形状的事件，丢弃并写一行诊断。
   */
  async subscribe(
    topics: readonly [EventTopic, ...EventTopic[]],
    listener: EventListener,
  ): Promise<EventSubscription> {
    let sub = -1;
    await this.#connection.request("events.subscribe", { topics: [...topics] }, (raw) => {
      const parsed = subscriptionSchema.safeParse(raw);
      if (!parsed.success) throw clientError("INTERNAL", {}, "events.subscribe result is invalid");
      sub = parsed.data.sub;
      this.#subscriptions.set(sub, { listener, lastSeq: 0 });
    });
    return {
      sub,
      unsubscribe: async () => {
        this.#subscriptions.delete(sub);
        if (this.#connection.isClosed) return;
        await this.call("events.unsubscribe", { sub }).catch(() => undefined);
      },
    };
  }

  /** 立刻关闭连接。不是 session.bye：命令行退出不该停掉别人持有的运行 */
  close(): void {
    this.#connection.close();
  }

  #onEvent(frame: EventFrame): void {
    const registered = this.#subscriptions.get(frame.sub);
    if (registered === undefined) return;
    const gap = frame.seq !== registered.lastSeq + 1;
    registered.lastSeq = frame.seq;
    if (!isEventName(frame.event)) {
      this.#diagnostic(`dropped unknown event ${frame.event}`);
      return;
    }
    const parsed = eventRegistry[frame.event].data.safeParse(frame.data);
    if (!parsed.success) {
      this.#diagnostic(`dropped malformed event ${frame.event}`);
      return;
    }
    registered.listener({
      event: frame.event,
      data: parsed.data,
      seq: frame.seq,
      gap,
    } as ClientEvent);
  }
}
