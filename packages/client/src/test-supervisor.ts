import { randomBytes } from "node:crypto";
import type { Server, Socket } from "node:net";
import { dirname } from "node:path/posix";
import { StringDecoder } from "node:string_decoder";
import { absPath, discoveryFilePath, type Platform } from "@runyard/platform";
import {
  createLineDecoder,
  encodeLine,
  helloSchema,
  NONCE_BYTES,
  proofMessage,
  type SupervisorFile,
} from "@runyard/protocol";

// 测试用的管理进程：在假平台的 ipc 上说真实的线上协议，但每个行为都能调：版本、运行个数、
// 冒充者（给错的证明、发短的或空的 nonce）、新版错误码。它不是产品代码（真正的是 @runyard/supervisor）。
// 收发的每个字节都记下来，好断言“口令从没出现在连接上”“没有收到过请求”。

export type Behaviour = "honest" | "impostor" | "short-nonce" | "empty-nonce-echo" | "silent";

export interface TestSupervisorOptions {
  platform: Platform;
  behaviour?: Behaviour;
  protocol?: number;
  minProtocol?: number;
  build?: string;
  version?: string;
  runs?: number;
  pid?: number;
  execPath?: string;
  /** 为某个方法定制响应；返回 { error } 就回错误帧 */
  respond?: (
    method: string,
    params: unknown,
  ) => { result: unknown } | { error: unknown } | "hang" | undefined;
  /** 订阅成功的响应和这些事件帧写在同一次 write 里（响应后紧跟事件，订阅登记不能晚） */
  eventsRightAfterSubscribe?: Array<{ seq: number; event: string; data: unknown }>;
}

export class TestSupervisor {
  readonly token = randomBytes(32).toString("hex");
  readonly received: Buffer[] = [];
  readonly requests: Array<{ method: string; params: unknown }> = [];
  connections = 0;
  helloCount = 0;
  runs: number;
  readonly #options: TestSupervisorOptions;
  readonly #sockets = new Set<Socket>();
  #server: Server | undefined;
  #nextSub = 1;

  private constructor(options: TestSupervisorOptions) {
    this.#options = options;
    this.runs = options.runs ?? 0;
  }

  static async start(options: TestSupervisorOptions): Promise<TestSupervisor> {
    const supervisor = new TestSupervisor(options);
    const server = await options.platform.ipc.listen();
    supervisor.#server = server;
    server.on("connection", (socket) => supervisor.#accept(socket));
    return supervisor;
  }

  get build(): string {
    return this.#options.build ?? "1.0.0+aaaa";
  }

  /** 连接上来往的全部字节（客户端发来的） */
  wire(): Buffer {
    return Buffer.concat(this.received);
  }

  discoveryFile(overrides: Partial<SupervisorFile> = {}): SupervisorFile {
    return {
      formatVersion: 1,
      pid: this.#options.pid ?? 424242,
      startedAt: 1_700_000_000_000,
      endpoint: this.#options.platform.ipc.endpoint(),
      token: this.token,
      protocol: this.#options.protocol ?? 1,
      minClientProtocol: this.#options.minProtocol ?? 1,
      version: this.#options.version ?? "1.0.0",
      build: this.build,
      host: "node",
      execPath: this.#options.execPath ?? "/fake/node",
      ...overrides,
    };
  }

  async publishDiscovery(overrides: Partial<SupervisorFile> = {}): Promise<void> {
    const { platform } = this.#options;
    const path = discoveryFilePath(platform.paths.stateDir);
    await platform.fs.makeDir(absPath(dirname(path)));
    await platform.fs.writeAtomic(path, `${JSON.stringify(this.discoveryFile(overrides))}\n`, {
      private: true,
    });
  }

  /** 给订阅发一个事件帧（模拟管理进程推送） */
  pushEvent(socketIndex: number, sub: number, seq: number, event: string, data: unknown): void {
    [...this.#sockets][socketIndex]?.write(encodeLine({ t: "evt", sub, seq, event, data }));
  }

  /** 立刻掐掉所有连接（模拟管理进程在请求中途死掉） */
  dropConnections(): void {
    for (const socket of this.#sockets) socket.destroy();
  }

  async stop(): Promise<void> {
    this.dropConnections();
    const server = this.#server;
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  #accept(socket: Socket): void {
    this.connections += 1;
    this.#sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => this.#sockets.delete(socket));
    const behaviour = this.#options.behaviour ?? "honest";
    if (behaviour === "silent") {
      socket.on("data", (chunk: Buffer) => this.received.push(chunk));
      return;
    }
    const nonce = this.#nonceFor(behaviour);
    const decoder = createLineDecoder();
    const utf8 = new StringDecoder("utf8");
    socket.write(
      encodeLine({
        t: "challenge",
        nonce,
        protocol: this.#options.protocol ?? 1,
        minProtocol: this.#options.minProtocol ?? 1,
      }),
    );
    let ready = false;
    socket.on("data", (chunk: Buffer) => {
      this.received.push(chunk);
      for (const line of decoder.push(utf8.write(chunk))) {
        if (!line.ok) continue;
        if (!ready) {
          ready = true;
          this.#onHello(socket, line.value, behaviour, nonce);
        } else this.#onRequest(socket, line.value);
      }
    });
  }

  #nonceFor(behaviour: Behaviour): string {
    const hex = (bytes: number) => randomBytes(bytes).toString("hex");
    if (behaviour === "short-nonce") return hex(NONCE_BYTES - 1);
    if (behaviour === "empty-nonce-echo") return "";
    return hex(NONCE_BYTES);
  }

  #onHello(socket: Socket, value: unknown, behaviour: Behaviour, nonce: string): void {
    this.helloCount += 1;
    const hello = helloSchema.safeParse(value);
    if (behaviour === "empty-nonce-echo") {
      // 把客户端的应答原样回传，当作自己的 ready
      socket.write(
        encodeLine({ t: "ready", proof: (value as { proof?: string }).proof, build: "x" }),
      );
      return;
    }
    if (!hello.success) return void socket.destroy();
    const { platform } = this.#options;
    const key = Buffer.from(this.token, "hex");
    if (behaviour === "impostor") {
      socket.write(
        encodeLine({ t: "ready", proof: randomBytes(32).toString("hex"), build: this.build }),
      );
      return;
    }
    const expected = proofMessage("client", nonce, hello.data.clientNonce);
    if (!platform.ipc.verifyProof(key, expected, hello.data.proof)) return void socket.destroy();
    const proof = platform.ipc.computeProof(
      key,
      proofMessage("server", nonce, hello.data.clientNonce),
    );
    socket.write(encodeLine({ t: "ready", proof, build: this.build }));
  }

  #onRequest(socket: Socket, value: unknown): void {
    const frame = value as { id: number; method: string; params: unknown };
    this.requests.push({ method: frame.method, params: frame.params });
    const reply = (body: Record<string, unknown>) =>
      socket.write(encodeLine({ t: "res", id: frame.id, ...body }));
    const custom = this.#options.respond?.(frame.method, frame.params);
    if (custom === "hang") return;
    if (custom !== undefined) {
      if ("error" in custom) reply({ ok: false, error: custom.error });
      else reply({ ok: true, result: custom.result });
      return;
    }
    switch (frame.method) {
      case "supervisor.info":
        reply({
          ok: true,
          result: {
            protocol: this.#options.protocol ?? 1,
            version: this.#options.version ?? "1.0.0",
            build: this.build,
            startedBy: "cli",
            runs: this.runs,
          },
        });
        return;
      case "supervisor.shutdown": {
        const { ifIdle } = frame.params as { ifIdle: boolean };
        const closing = !(ifIdle && this.runs > 0);
        reply({ ok: true, result: { closing } });
        if (closing) void this.stop();
        return;
      }
      case "events.subscribe": {
        const sub = this.#nextSub++;
        const events = (this.#options.eventsRightAfterSubscribe ?? []).map((e) =>
          encodeLine({ t: "evt", sub, ...e }),
        );
        socket.write(
          [encodeLine({ t: "res", id: frame.id, ok: true, result: { sub } }), ...events].join(""),
        );
        return;
      }
      default:
        reply({ ok: true, result: {} });
    }
  }
}
