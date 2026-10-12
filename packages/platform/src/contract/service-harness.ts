import { createServer, type Server, Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { type AbsPath, absPath } from "../path-types.ts";
import type { ManagedProcess, Platform } from "../platform.ts";
import type { ProcessLedger } from "./process-ledger.ts";

// 契约测试的共用工具：起假程序树、等它起好、挑动态端口。

export const FAKE_SERVICE = fileURLToPath(new URL("./fixtures/fake-service.ts", import.meta.url));
export const WAIT_MS = 30_000;

export interface ServiceConfig {
  listen?: number;
  ignoreTerm?: boolean;
  ignoreInterrupt?: boolean;
  exitOnInterrupt?: boolean;
  exitAfterMs?: number;
  children?: ServiceConfig[];
}

export interface RunningTree {
  readonly proc: ManagedProcess;
  /** 树里每个进程的 pid（按 `up` 行出现的顺序） */
  readonly pids: number[];
  readonly output: () => string;
}

/** 数配置里一共有几个进程 */
export function countProcesses(config: ServiceConfig): number {
  return 1 + (config.children ?? []).reduce((sum, child) => sum + countProcesses(child), 0);
}

function countListeners(config: ServiceConfig): number {
  return (
    (config.listen === undefined ? 0 : 1) +
    (config.children ?? []).reduce((sum, child) => sum + countListeners(child), 0)
  );
}

/** 起一棵假进程树，等到每个进程都报了 `up`、每个要监听的都报了 `listening`，并全部记账 */
export async function startTree(
  platform: Platform,
  ledger: ProcessLedger,
  config: ServiceConfig,
  cwd: AbsPath,
): Promise<RunningTree> {
  const proc = platform.exec.spawn({
    argv: [process.execPath, FAKE_SERVICE, JSON.stringify(config)],
    cwd,
    env: { PATH: process.env.PATH ?? "" },
    stdin: false,
  });
  ledger.add(proc.ref);

  let text = "";
  const pids: number[] = [];
  const wantUp = countProcesses(config);
  const wantListening = countListeners(config);
  let listening = 0;
  let notify: () => void = () => {};
  proc.stderr.on("data", (chunk: Buffer) => {
    text += chunk.toString();
  });
  proc.stdout.on("data", (chunk: Buffer) => {
    text += chunk.toString();
    for (const line of chunk.toString().split("\n")) {
      const up = /^up (\d+)$/.exec(line);
      if (up) {
        pids.push(Number(up[1]));
        // 记账：越早越好，进程之后可能很快退出
        void ledger.track(Number(up[1]));
      }
      if (/^listening \d+$/.test(line)) listening += 1;
    }
    notify();
  });

  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`进程树 ${WAIT_MS} 毫秒内没起好：${text}`)),
      WAIT_MS,
    );
    notify = () => {
      if (pids.length >= wantUp && listening >= wantListening) {
        clearTimeout(timer);
        resolve();
      }
    };
  });
  await ready;
  // 等记账的 identity 查询都落定，之后的断言才不会漏掉某个进程
  await Promise.all(pids.map((pid) => ledger.track(pid)));
  return { proc, pids, output: () => text };
}

/** 向系统要一个当前空闲的端口（绑 127.0.0.1:0 读回来再关） */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1" }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

export const tempAbs = (dir: string): AbsPath => absPath(dir);

/** 在 timeoutMs 内每 10 毫秒查一次条件，成立返回花了多久；超时抛错 */
export async function eventually(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  what: string,
): Promise<number> {
  const started = performance.now();
  while (!(await check())) {
    if (performance.now() - started > timeoutMs) {
      throw new Error(`${timeoutMs} 毫秒内没等到：${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return performance.now() - started;
}

/** 测试自己开的服务器和连接，结束时统一关掉 */
export class NetResources {
  readonly #servers: Server[] = [];
  readonly #sockets: Socket[] = [];

  /** 监听 host:port（端口缺省由系统分配），返回实际端口；这个地址族不可用时返回 null */
  async listen(host: string, port = 0): Promise<{ server: Server; port: number } | null> {
    const server = createServer((socket) => {
      this.#sockets.push(socket);
      socket.on("error", () => {});
    });
    const bound = await new Promise<boolean>((resolve) => {
      server.once("error", () => resolve(false));
      server.listen({ port, host }, () => resolve(true));
    });
    if (!bound) return null;
    this.#servers.push(server);
    const address = server.address();
    return { server, port: typeof address === "object" && address ? address.port : 0 };
  }

  async connect(port: number): Promise<Socket> {
    const socket = new Socket();
    this.#sockets.push(socket);
    socket.on("error", () => {});
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(port, "127.0.0.1", resolve);
    });
    return socket;
  }

  async dispose(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    await Promise.all(
      this.#servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    );
    this.#servers.length = 0;
    this.#sockets.length = 0;
  }
}
