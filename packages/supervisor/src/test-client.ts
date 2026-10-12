import { randomBytes } from "node:crypto";
import type { Socket } from "node:net";
import type { Platform } from "@runyard/platform";
import {
  type Challenge,
  challengeSchema,
  type Hello,
  NONCE_BYTES,
  PROTOCOL_VERSION,
  proofMessage,
  type Ready,
  readySchema,
} from "@runyard/protocol";

// 测试用的客户端：能走完整握手，也能故意走歪。它不是产品代码（真正的客户端是 #44），
// 只用来在测试里从连接的另一头看管理进程做了什么。收发的每个字节都记下来，
// 好断言“口令从没出现在连接上”。不导入 @runyard/testing，平台由调用方传入。

const WAIT_MS = 3000;

export interface HelloOptions {
  kind?: "app" | "cli";
  protocol?: number;
  minProtocol?: number;
  build?: string;
  pid?: number;
  /** 覆盖 clientNonce（比如长度不对的） */
  clientNonce?: string;
  /** 覆盖证明（比如用错的口令或错的方向算的） */
  proof?: string;
}

export class TestClient {
  readonly received: Buffer[] = [];
  readonly sent: Buffer[] = [];
  readonly #socket: Socket;
  readonly #queue: unknown[] = [];
  readonly #waiters: Array<() => void> = [];
  #buffer = "";
  #nextId = 1;
  #closed = false;
  /** 握手时收到的质询 */
  challenge: Challenge | undefined;
  readonly closed: Promise<void>;

  constructor(socket: Socket) {
    this.#socket = socket;
    socket.on("data", (chunk: Buffer) => this.#onData(chunk));
    socket.on("error", () => {});
    this.closed = new Promise((resolve) => {
      socket.once("close", () => {
        this.#closed = true;
        resolve();
        for (const waiter of this.#waiters.splice(0)) waiter();
      });
    });
  }

  static async connect(platform: Platform): Promise<TestClient> {
    return new TestClient(await platform.ipc.connect(1000));
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  #onData(chunk: Buffer): void {
    this.received.push(chunk);
    this.#buffer += chunk.toString("utf8");
    for (let end = this.#buffer.indexOf("\n"); end >= 0; end = this.#buffer.indexOf("\n")) {
      const line = this.#buffer.slice(0, end);
      this.#buffer = this.#buffer.slice(end + 1);
      this.#queue.push(JSON.parse(line));
    }
    for (const waiter of this.#waiters.splice(0)) waiter();
  }

  /** 下一条收到的消息；连接先关了返回 undefined。等不到就抛错，避免测试挂住 */
  async next(): Promise<unknown> {
    const deadline = Date.now() + WAIT_MS;
    while (this.#queue.length === 0) {
      if (this.#closed) return undefined;
      if (Date.now() > deadline) throw new Error("timed out waiting for a message");
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
        setTimeout(resolve, 50).unref();
      });
    }
    return this.#queue.shift();
  }

  /** 已经收到但还没取走的消息个数 */
  get pending(): number {
    return this.#queue.length;
  }

  write(value: unknown): void {
    this.writeRaw(`${JSON.stringify(value)}\n`);
  }

  writeRaw(text: string | Buffer): void {
    const data = typeof text === "string" ? Buffer.from(text) : text;
    this.sent.push(data);
    this.#socket.write(data);
  }

  /** 停止读取：服务端写的内容堆在内核和它自己的缓冲里（模拟慢消费者） */
  pause(): void {
    this.#socket.pause();
  }

  destroy(): void {
    this.#socket.destroy();
  }

  /** 连接上来往的全部字节（两个方向） */
  wire(): Buffer {
    return Buffer.concat([...this.received, ...this.sent]);
  }

  async readChallenge(): Promise<Challenge> {
    return challengeSchema.parse(await this.next());
  }

  buildHello(
    platform: Platform,
    token: Uint8Array,
    challenge: Challenge,
    options: HelloOptions = {},
  ): Hello {
    const clientNonce = options.clientNonce ?? randomBytes(NONCE_BYTES).toString("hex");
    return {
      t: "hello",
      clientNonce,
      proof:
        options.proof ??
        platform.ipc.computeProof(token, proofMessage("client", challenge.nonce, clientNonce)),
      protocol: options.protocol ?? PROTOCOL_VERSION,
      minProtocol: options.minProtocol ?? PROTOCOL_VERSION,
      client: {
        kind: options.kind ?? "cli",
        build: options.build ?? "test-build",
        pid: options.pid ?? process.pid,
      },
    };
  }

  /** 走完握手并校验服务端的证明，像真客户端那样 */
  async handshake(
    platform: Platform,
    token: Uint8Array,
    options: HelloOptions = {},
  ): Promise<{ challenge: Challenge; hello: Hello; ready: Ready }> {
    const challenge = await this.readChallenge();
    this.challenge = challenge;
    const hello = this.buildHello(platform, token, challenge, options);
    this.write(hello);
    const ready = readySchema.parse(await this.next());
    const expected = proofMessage("server", challenge.nonce, hello.clientNonce);
    if (!platform.ipc.verifyProof(token, expected, ready.proof)) {
      throw new Error("server proof did not verify");
    }
    return { challenge, hello, ready };
  }

  /** 发一个请求并等对应 id 的响应（先到的别的消息放回队列前面不处理，测试里不会并发到这种程度） */
  async request(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
    const id = this.#nextId++;
    this.write({ t: "req", id, method, params });
    for (;;) {
      const message = (await this.next()) as Record<string, unknown> | undefined;
      if (message === undefined) throw new Error("connection closed before the response");
      if (message.t === "res" && message.id === id) return message;
    }
  }

  /** 发一个请求但不等响应，返回它的 id */
  send(method: string, params: unknown = {}): number {
    const id = this.#nextId++;
    this.write({ t: "req", id, method, params });
    return id;
  }
}

export function tokenBytes(tokenHex: string): Uint8Array {
  return Buffer.from(tokenHex, "hex");
}
