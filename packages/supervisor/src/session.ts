import type { Socket } from "node:net";
import { StringDecoder } from "node:string_decoder";
import {
  type ClientKind,
  createLineDecoder,
  decideVersionAction,
  type EventName,
  encodeLine,
  type Frame,
  type Hello,
  type LineResult,
  LineTooLargeError,
  type RequestFrame,
  type RunyardError,
  requestFrameSchema,
} from "@runyard/protocol";
import type { ServerHandshake } from "./handshake-server.ts";
import type { SupervisorClock } from "./supervisor-clock.ts";

// 一个连接一个会话。握手完成前只接受 hello，别的一切（包括请求）都断开；
// 握手之后才分发请求、推送事件。出错只关这一个连接，不影响别的会话和运行。

export type SessionCloseReason =
  | "peer-closed"
  | "handshake-failed"
  | "handshake-timeout"
  | "protocol-violation"
  | "slow-consumer"
  | "bye"
  | "shutdown";

export interface SessionInfo {
  readonly id: number;
  readonly kind: ClientKind;
  readonly pid: number;
  readonly build: string;
}

export interface Reply {
  readonly frame: Frame;
  /** 响应写出去之后关闭连接（session.bye） */
  readonly closeAfter?: boolean;
  /** 响应写出去之后再做的事（supervisor.shutdown 要等响应先到客户端手里） */
  readonly after?: () => void;
}

export interface SessionDeps {
  readonly handshake: ServerHandshake;
  readonly clock: SupervisorClock;
  readonly handshakeTimeoutMs: number;
  /** 事件积压超过它就把这个慢消费者断开 */
  readonly maxPendingEventBytes: number;
  readonly supervisor: { protocol: number; minProtocol: number; build: string };
  handle(session: Session, request: RequestFrame): Promise<Reply>;
  onReady(session: Session): void;
  onClosed(session: Session, reason: SessionCloseReason, wasReady: boolean): void;
}

interface Subscription {
  readonly accepts: (event: EventName) => boolean;
  seq: number;
}

export class Session {
  readonly id: number;
  readonly #socket: Socket;
  readonly #deps: SessionDeps;
  readonly #decoder = createLineDecoder();
  readonly #utf8 = new StringDecoder("utf8");
  readonly #subscriptions = new Map<number, Subscription>();
  #nextSub = 1;
  #timer: number | undefined;
  #info: SessionInfo | undefined;
  #clientOutdated: RunyardError | undefined;
  #closed = false;
  /** 底层连接真正关掉时 resolve（end 之后还要等已写的内容送完） */
  readonly socketClosed: Promise<void>;

  constructor(id: number, socket: Socket, deps: SessionDeps) {
    this.id = id;
    this.#socket = socket;
    this.#deps = deps;
    this.socketClosed = new Promise((resolve) => {
      if (socket.destroyed) resolve();
      else socket.once("close", () => resolve());
    });
  }

  get info(): SessionInfo | undefined {
    return this.#info;
  }

  get ready(): boolean {
    return this.#info !== undefined;
  }

  /** 客户端协议低于本管理进程的最低要求时的错误；握手已完成，但请求一律不处理 */
  get clientOutdated(): RunyardError | undefined {
    return this.#clientOutdated;
  }

  start(): void {
    this.#socket.on("data", (chunk: Buffer) => this.#onData(chunk));
    this.#socket.on("error", () => this.#socket.destroy());
    this.#socket.on("close", () => this.#finish("peer-closed"));
    this.#timer = this.#deps.clock.setTimeout(
      () => this.close("handshake-timeout"),
      this.#deps.handshakeTimeoutMs,
    );
    this.#write(this.#deps.handshake.challenge);
  }

  /** 立刻断开；重复调用无副作用 */
  close(reason: SessionCloseReason): void {
    this.#finish(reason);
    this.#socket.destroy();
  }

  /** 把已写出的内容送完再关（关闭管理进程时用） */
  end(reason: SessionCloseReason): void {
    this.#finish(reason);
    this.#socket.end();
  }

  destroyNow(): void {
    this.#socket.destroy();
  }

  addSubscription(accepts: (event: EventName) => boolean): number {
    const sub = this.#nextSub++;
    this.#subscriptions.set(sub, { accepts, seq: 0 });
    return sub;
  }

  removeSubscription(sub: number): boolean {
    return this.#subscriptions.delete(sub);
  }

  hasSubscription(sub: number): boolean {
    return !this.#closed && this.#subscriptions.has(sub);
  }

  /**
   * 只发给某一个订阅（logs.follow：run.log 的事件体里没有项目，谁该收到由日志服务按项目决定）。
   * 序号、积压上限的处理与 deliver 相同
   */
  deliverTo(sub: number, event: EventName, data: unknown): void {
    const subscription = this.#subscriptions.get(sub);
    if (subscription === undefined || this.#closed || !this.ready) return;
    if (this.#socket.writableLength > this.#deps.maxPendingEventBytes) {
      this.close("slow-consumer");
      return;
    }
    subscription.seq += 1;
    this.#write({ t: "evt", sub, seq: subscription.seq, event, data });
  }

  /** 这条连接现在会不会收到这个事件（订阅了所属主题）；释放顺序据此决定等谁回报 */
  wouldReceive(event: EventName): boolean {
    if (this.#closed || !this.ready) return false;
    for (const subscription of this.#subscriptions.values()) {
      if (subscription.accepts(event)) return true;
    }
    return false;
  }

  // 同一个订阅内 seq 递增，客户端靠它发现丢失。写不出去的积压超限就断开慢消费者：
  // 事件都可以由客户端重新读取快照补回，不能为了一个慢客户端让管理进程的内存无限增长
  deliver(event: EventName, data: unknown): void {
    if (this.#closed || !this.ready) return;
    for (const [sub, subscription] of this.#subscriptions) {
      if (!subscription.accepts(event)) continue;
      if (this.#socket.writableLength > this.#deps.maxPendingEventBytes) {
        this.close("slow-consumer");
        return;
      }
      subscription.seq += 1;
      this.#write({ t: "evt", sub, seq: subscription.seq, event, data });
    }
  }

  #onData(chunk: Buffer): void {
    if (this.#closed) return;
    const text = this.#utf8.write(chunk);
    for (const result of this.#decoder.push(text)) {
      if (this.#closed) return;
      this.#onLine(result);
    }
  }

  #onLine(result: LineResult): void {
    if (!result.ok) {
      this.close("protocol-violation");
      return;
    }
    if (!this.ready) this.#onHello(result.value);
    else this.#onFrame(result.value);
  }

  #onHello(value: unknown): void {
    const verdict = this.#deps.handshake.receiveHello(value);
    if (!verdict.ok) {
      // 不回任何内容：失败的原因对对方没有用，只会帮冒充者试探
      this.close("handshake-failed");
      return;
    }
    if (this.#timer !== undefined) this.#deps.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
    const { hello } = verdict;
    this.#info = {
      id: this.id,
      kind: hello.client.kind,
      pid: hello.client.pid,
      build: hello.client.build,
    };
    this.#clientOutdated = this.#versionError(hello);
    this.#write(verdict.ready);
    this.#deps.onReady(this);
  }

  // 版本表的“客户端低于最低要求”一行（decideVersionAction 先判这一行，与运行个数无关）
  #versionError(hello: Hello): RunyardError | undefined {
    const { supervisor } = this.#deps;
    const decision = decideVersionAction({
      client: {
        protocol: hello.protocol,
        minProtocol: hello.minProtocol,
        build: hello.client.build,
      },
      supervisor,
      runs: 0,
      executableExists: true,
    });
    if (decision.action !== "reject" || decision.error.code !== "CLIENT_OUTDATED") return undefined;
    return {
      code: "CLIENT_OUTDATED",
      params: {},
      debug: "client protocol is below the supervisor minimum",
    };
  }

  #onFrame(value: unknown): void {
    const request = requestFrameSchema.safeParse(value);
    // 响应和事件帧不是客户端该发的；忽略不认识的帧，不因此断开（接收方忽略不认识的东西）
    if (!request.success) return;
    const { id } = request.data;
    void this.#deps.handle(this, request.data).then((reply) => {
      if (this.#closed) return;
      this.#writeReply(id, reply.frame);
      reply.after?.();
      if (reply.closeAfter) this.end("bye");
    });
  }

  // 响应超过单行上限时发不出去：改发一个 INTERNAL，客户端至少不会一直等
  #writeReply(id: number, frame: Frame): void {
    try {
      this.#write(frame);
    } catch (error) {
      if (!(error instanceof LineTooLargeError)) throw error;
      const debug = "response exceeds the maximum line size";
      this.#write({ t: "res", id, ok: false, error: { code: "INTERNAL", params: {}, debug } });
    }
  }

  #write(value: unknown): void {
    if (this.#socket.destroyed || !this.#socket.writable) return;
    this.#socket.write(encodeLine(value));
  }

  #finish(reason: SessionCloseReason): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== undefined) this.#deps.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#subscriptions.clear();
    this.#deps.onClosed(this, reason, this.ready);
  }
}
