import type { Socket } from "node:net";
import { StringDecoder } from "node:string_decoder";
import {
  createLineDecoder,
  type EventFrame,
  encodeLine,
  frameSchema,
  type LineResult,
  type WireError,
} from "@runyard/protocol";
import type { ClientClock } from "./client-clock.ts";
import { ClientError, unavailable } from "./client-error.ts";

// 一条连接：分行、握手阶段按条取消息、握手之后按 id 对应请求和响应、把事件交给订阅方。
// 出任何问题（坏 JSON、超长行、对端关闭）连接就整个关掉，等着的请求都以 SUPERVISOR_UNAVAILABLE 失败。

export type NextMessage =
  | { kind: "message"; value: unknown }
  | { kind: "closed" }
  | { kind: "timeout" };

interface Pending {
  resolve(value: unknown): void;
  reject(error: ClientError): void;
  /** 响应到达时立刻（同步）调用，早于后面紧跟着的事件帧被处理：订阅要在这里登记，不然会丢事件 */
  onResult?: (result: unknown) => void;
}

export class Connection {
  readonly #socket: Socket;
  readonly #clock: ClientClock;
  readonly #decoder = createLineDecoder();
  readonly #utf8 = new StringDecoder("utf8");
  readonly #queue: unknown[] = [];
  readonly #pending = new Map<number, Pending>();
  #wake: (() => void) | undefined;
  #framing = false;
  #closed = false;
  #nextId = 1;
  #eventListener: ((frame: EventFrame) => void) | undefined;
  readonly closed: Promise<void>;

  constructor(socket: Socket, clock: ClientClock) {
    this.#socket = socket;
    this.#clock = clock;
    this.closed = new Promise((resolve) => {
      socket.once("close", () => {
        this.#closed = true;
        this.#failPending(unavailable("connection closed"));
        this.#wake?.();
        resolve();
      });
    });
    socket.on("error", () => socket.destroy());
    socket.on("data", (chunk: Buffer) => this.#onData(chunk));
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  #onData(chunk: Buffer): void {
    for (const result of this.#decoder.push(this.#utf8.write(chunk))) {
      if (this.#closed) return;
      this.#onLine(result);
    }
  }

  #onLine(result: LineResult): void {
    if (!result.ok) {
      this.close();
      return;
    }
    if (this.#framing) this.#onFrame(result.value);
    else {
      this.#queue.push(result.value);
      this.#wake?.();
    }
  }

  #onFrame(value: unknown): void {
    const parsed = frameSchema.safeParse(value);
    if (!parsed.success) return;
    const frame = parsed.data;
    if (frame.t === "evt") {
      this.#eventListener?.(frame);
      return;
    }
    if (frame.t !== "res") return;
    const pending = this.#pending.get(frame.id);
    if (pending === undefined) return;
    this.#pending.delete(frame.id);
    if (frame.ok) {
      try {
        pending.onResult?.(frame.result);
      } catch (error) {
        pending.reject(error instanceof ClientError ? error : unavailable(String(error)));
        return;
      }
      pending.resolve(frame.result);
    } else pending.reject(new ClientError(frame.error satisfies WireError));
  }

  /** 握手阶段取下一条消息；最多等 timeoutMs */
  async nextMessage(timeoutMs: number): Promise<NextMessage> {
    const deadline = this.#clock.now() + timeoutMs;
    for (;;) {
      if (this.#queue.length > 0) return { kind: "message", value: this.#queue.shift() };
      if (this.#closed) return { kind: "closed" };
      if (this.#clock.now() >= deadline) return { kind: "timeout" };
      await new Promise<void>((resolve) => {
        const timer = this.#clock.setTimeout(resolve, Math.max(0, deadline - this.#clock.now()));
        this.#wake = () => {
          this.#clock.clearTimeout(timer);
          resolve();
        };
      });
      this.#wake = undefined;
    }
  }

  send(value: unknown): void {
    if (this.#closed) throw unavailable("connection closed");
    this.#socket.write(encodeLine(value));
  }

  setEventListener(onEvent: (frame: EventFrame) => void): void {
    this.#eventListener = onEvent;
  }

  /** 握手通过后切到帧模式。握手期间已经到达的帧按顺序补处理 */
  startFrames(): void {
    this.#framing = true;
    for (const value of this.#queue.splice(0)) this.#onFrame(value);
  }

  request(method: string, params: unknown, onResult?: (result: unknown) => void): Promise<unknown> {
    if (this.#closed) return Promise.reject(unavailable("connection closed"));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, onResult });
      try {
        this.send({ t: "req", id, method, params });
      } catch (error) {
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  #failPending(error: ClientError): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }

  close(): void {
    this.#socket.destroy();
  }
}
