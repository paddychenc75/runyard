import { createServer, connect as netConnect, type Server, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type AbsPath,
  type Arch,
  absPath,
  type Platform,
  type PlatformId,
  platformError,
  platformFor,
} from "@runyard/platform";
import { FakeClock } from "./fake-clock.ts";
import { FakePorts } from "./fake-ports.ts";
import { FakeProcesses } from "./fake-processes.ts";
import { FakeEnv, FakeTools } from "./fake-toolchain.ts";
import { MemoryFs } from "./memory-fs.ts";

export interface FakePlatformOptions {
  /** 主目录；`~/.runyard` 和 `~/Runyard` 都由它推出。默认是一个不存在的 /fake-home，绝不是真实主目录 */
  readonly home?: AbsPath;
  readonly arch?: Arch;
  readonly profile?: "dev";
  /** 默认 darwin；契约测试里的 id 必须与实现自己的名字一致 */
  readonly id?: PlatformId;
  readonly caps?: Partial<Platform["caps"]>;
  /** 共用一个假时钟（例如被测的运行引擎也用它） */
  readonly clock?: FakeClock;
}

export type DesktopCall =
  | { readonly kind: "reveal"; readonly path: AbsPath }
  | { readonly kind: "openTerminalAt"; readonly dir: AbsPath }
  | { readonly kind: "openInEditor"; readonly dir: AbsPath; readonly editor: string };

export interface FakePlatform {
  /** 实现 `Platform` 接口的内存版，交给被测代码 */
  readonly platform: Platform;
  readonly clock: FakeClock;
  readonly processes: FakeProcesses;
  readonly ports: FakePorts;
  readonly fs: MemoryFs;
  readonly env: FakeEnv;
  readonly tools: FakeTools;
  /** 桌面接口被调用的记录（reveal、openTerminalAt、openInEditor） */
  readonly desktopCalls: DesktopCall[];
  /** 关掉 ipc 用到的 socket */
  dispose(): Promise<void>;
}

const FAKE_HOME = absPath("/fake-home");

// 假平台：与真实的 Platform 同一个接口，状态全在内存里，时间由假时钟推进。
// paths 直接用真实实现的纯函数（名称校验等），所以不会与真实规则漂移。
// 例外：ipc 的 listen / connect 用 127.0.0.1 上的临时 TCP 端口当传输（Server 和 Socket 是 Node 的真类型，没有内存版）。
export function createFakePlatform(options: FakePlatformOptions = {}): FakePlatform {
  const home = options.home ?? FAKE_HOME;
  if (home === absPath(homedir())) {
    throw platformError("INTERNAL", {}, "refusing to use the real home directory in a test");
  }
  const reference = platformFor("darwin", {
    home,
    arch: options.arch ?? "arm64",
    profile: options.profile,
  });
  const caps = { ...reference.caps, ...options.caps };
  const clock = options.clock ?? new FakeClock();
  const ports = new FakePorts(clock);
  const fs = new MemoryFs();
  const processes = new FakeProcesses(clock, ports, fs, caps.gracefulStop === "graceful");
  const env = new FakeEnv();
  const tools = new FakeTools(processes);
  const desktopCalls: DesktopCall[] = [];
  const net = new FakeIpc();
  const name = (dir: AbsPath) => dir.split(/[\\/]/).pop() ?? "";

  const platform: Platform = {
    id: options.id ?? "darwin",
    arch: reference.arch,
    caps,
    paths: reference.paths,
    env: {
      load: (opts) => env.load(opts),
      runDefaults: () => ({ ...env.runDefaults }),
    },
    exec: {
      which: async (tool, e) => tools.which(tool, e),
      spawn: (spec) => processes.spawn(spec),
      spawnDetached: async (argv, opts) => {
        if (argv.length === 0) throw platformError("INTERNAL", {}, "empty argv");
        return processes.spawnDetached(argv, opts);
      },
    },
    proc: {
      terminate: (ref, o) => processes.terminate(ref, o),
      members: async (ref) => processes.members(ref),
      findByMarker: async (marker) => processes.findByMarker(marker),
      identity: async (pid) => processes.identity(pid),
    },
    ports: {
      isFree: async (port) => ports.status(port),
      occupant: async (port) => ports.occupant(port),
      connections: async (port) => ports.connections(port),
      loopbackOnly: async (port) => ports.loopbackOnly(port),
    },
    fs: {
      moveDir: async (from, to) => fs.moveDir(from, to, name(from)),
      trash: async (dir) => fs.trash(dir, name(dir)),
      writeAtomic: async (file, data) => fs.writeAtomic(file, data),
    },
    watch: async (root, opts, callback) => fs.watch(root, opts, callback),
    ipc: {
      // 地址和握手证明沿用真实实现的纯函数，不重写
      endpoint: () => reference.ipc.endpoint(),
      listen: () => net.listen(),
      connect: (timeoutMs) => net.connect(timeoutMs),
      computeProof: reference.ipc.computeProof,
      verifyProof: reference.ipc.verifyProof,
    },
    tools: {
      candidates: async (tool, e) => tools.candidates(tool, e),
      packageManagers: async () => [...tools.packageManagers],
    },
    shell: { interactive: async () => [...tools.shells] },
    desktop: {
      reveal: async (path) => void desktopCalls.push({ kind: "reveal", path }),
      openTerminalAt: async (dir) => void desktopCalls.push({ kind: "openTerminalAt", dir }),
      openInEditor: async (dir, editor) =>
        void desktopCalls.push({ kind: "openInEditor", dir, editor }),
    },
    cli: {
      installShim: async () => ({ path: join(home, ".local", "bin", "runyard"), onPath: true }),
    },
  };
  return {
    platform,
    clock,
    processes,
    ports,
    fs,
    env,
    tools,
    desktopCalls,
    dispose: () => net.close(),
  };
}

class FakeIpc {
  #port: number | null = null;
  readonly #servers = new Set<Server>();
  readonly #sockets = new Set<Socket>();

  // 与真实实现一致：已经有监听者（持锁）时抛 BUSY，不会有两个管理进程
  async listen(): Promise<Server> {
    if ([...this.#servers].some((live) => live.listening)) {
      throw platformError("BUSY", { name: "fake-ipc" }, "a fake supervisor is already listening");
    }
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    this.#port = typeof address === "object" && address !== null ? address.port : null;
    this.#servers.add(server);
    return server;
  }

  connect(timeoutMs: number): Promise<Socket> {
    const port = this.#port;
    const unavailable = () =>
      platformError("SUPERVISOR_UNAVAILABLE", {}, "fake ipc is not listening");
    if (port === null) return Promise.reject(unavailable());
    return new Promise((resolve, reject) => {
      const socket = netConnect({ host: "127.0.0.1", port });
      this.#sockets.add(socket);
      socket.setTimeout(timeoutMs, () => socket.destroy(unavailable()));
      socket.once("error", () => reject(unavailable()));
      socket.once("connect", () => {
        socket.setTimeout(0);
        socket.removeAllListeners("error");
        resolve(socket);
      });
    });
  }

  async close(): Promise<void> {
    for (const socket of this.#sockets) socket.destroy();
    await Promise.all(
      [...this.#servers].map(
        (server) =>
          new Promise<void>((resolve) =>
            server.listening ? server.close(() => resolve()) : resolve(),
          ),
      ),
    );
    this.#sockets.clear();
    this.#servers.clear();
  }
}
