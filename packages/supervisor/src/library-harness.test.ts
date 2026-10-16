import { join } from "node:path";
import type { PlaygroundSeed } from "@runyard/core";
import { type AbsPath, absPath, posixRelPath } from "@runyard/platform";
import type { Owner } from "@runyard/protocol";
import { expect, it } from "vitest";
import type { LibrarySeams, TemplateCatalog } from "./library-seams.ts";
import type { RunsView } from "./runs-view.ts";
import { World } from "./supervisor-harness.test.ts";
import type { SupervisorHandle } from "./supervisor-options.ts";
import type { TestClient } from "./test-client.ts";

// 资源库、设置方法的单元测试共用的现场：假平台上的管理进程，加上 #40（运行）和模板各 issue 尚未实现的
// 那几处的替身（RunsView、TemplateCatalog）。真实的实现接上时，这两个替身就是它们要满足的接口。

export const cliOwner: Owner = { kind: "cli", command: "run demo" };

export class FakeRuns implements RunsView {
  readonly active = new Map<string, Owner>();
  readonly busy = new Set<string>();
  /** stop、start 的调用顺序，测试用它断言释放顺序 */
  readonly calls: string[] = [];
  onStop: (id: string) => void = () => {};

  activePlaygrounds = () => new Set(this.active.keys());
  isBusy = (id: string) => this.busy.has(id);
  ownerOf = (id: string) => this.active.get(id);
  async stop(id: string) {
    this.calls.push(`stop:${id}`);
    this.onStop(id);
    this.active.delete(id);
  }
  async start(id: string, owner: Owner) {
    this.calls.push(`start:${id}`);
    this.active.set(id, owner);
  }
}

export class FakeCatalog implements TemplateCatalog {
  async seed(request: { template: string; name: string }): Promise<PlaygroundSeed> {
    return {
      template: { id: request.template, source: "builtin", appVersion: "0.0.0" },
      runner: "node-server",
      requires: { node: ">=24" },
      toolchainAtCreate: { node: "24.21.0" },
      files: [{ path: posixRelPath("index.js"), contents: `// ${request.name}\n` }],
    };
  }
  runnerKind = () => "server" as const;
}

/** 带响应表和事件表的客户端：同一条连接上并发的请求、穿插的事件都不丢 */
export class Pump {
  readonly events: { event: string; data: unknown }[] = [];
  readonly #waiting = new Map<number, (message: Record<string, unknown>) => void>();
  readonly #arrived = new Map<number, Record<string, unknown>>();
  #stopped = false;

  readonly client: TestClient;

  constructor(client: TestClient) {
    this.client = client;
    void this.#loop();
  }

  async #loop(): Promise<void> {
    while (!this.#stopped) {
      let message: Record<string, unknown> | undefined;
      try {
        message = (await this.client.next()) as Record<string, unknown> | undefined;
      } catch {
        continue; // 一段时间没有消息，接着等
      }
      if (message === undefined) return;
      if (message.t === "evt") {
        this.events.push({ event: message.event as string, data: message.data });
      } else if (message.t === "res") {
        const id = message.id as number;
        const waiter = this.#waiting.get(id);
        if (waiter) waiter(message);
        else this.#arrived.set(id, message);
      }
    }
  }

  /** 发请求，返回响应帧 */
  call(method: string, params: unknown = {}): Promise<Record<string, unknown>> {
    const id = this.client.send(method, params);
    return new Promise((resolve) => {
      const early = this.#arrived.get(id);
      if (early) resolve(early);
      else this.#waiting.set(id, resolve);
    });
  }

  async result<T = unknown>(method: string, params: unknown = {}): Promise<T> {
    const response = await this.call(method, params);
    if (response.ok !== true) throw new Error(`${method} failed: ${JSON.stringify(response)}`);
    return response.result as T;
  }

  async errorCode(method: string, params: unknown = {}): Promise<string> {
    const response = await this.call(method, params);
    expect(response.ok).toBe(false);
    return (response.error as { code: string }).code;
  }

  eventsOf(name: string): unknown[] {
    return this.events.filter((entry) => entry.event === name).map((entry) => entry.data);
  }

  async waitForEvent(name: string): Promise<unknown> {
    // 连接上的事件走真实的 socket，到达要几个事件循环；按真实时间轮询，上限 2 秒
    for (let i = 0; i < 400; i++) {
      const found = this.eventsOf(name);
      if (found.length > 0) return found[found.length - 1];
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`no ${name} event arrived`);
  }

  stop(): void {
    this.#stopped = true;
  }
}

export class LibraryWorld {
  readonly world = new World();
  readonly runs = new FakeRuns();
  readonly catalog = new FakeCatalog();
  readonly logs: string[] = [];
  readonly pumps: Pump[] = [];
  handle!: SupervisorHandle;

  get fs() {
    return this.world.fake.fs;
  }
  get clock() {
    return this.world.clock;
  }
  /** 资源库根目录和里面的路径（先过 join 归一化分隔符，内存文件系统按字符串比较路径） */
  get root(): AbsPath {
    return absPath(join(this.world.fake.platform.paths.defaultLibrary));
  }
  at(...parts: string[]): AbsPath {
    return absPath(join(this.root, ...parts));
  }
  settingsPath(): AbsPath {
    return absPath(join(this.world.fake.platform.paths.stateDir, "settings.json"));
  }
  indexPath(): AbsPath {
    return absPath(join(this.world.fake.platform.paths.stateDir, "state", "library.json"));
  }

  async start(seams: LibrarySeams = {}): Promise<void> {
    this.handle = await this.world.start({
      log: (line) => this.logs.push(line),
      extend: () => ({ library: { ...this.seams(), ...seams } }),
    });
  }

  /** 端口槽位的替身（#36 尚未实现）：从 7100 起顺序分配，跳过已登记的 */
  seams(): LibrarySeams {
    return {
      runs: this.runs,
      templates: this.catalog,
      ports: {
        allocate: async ({ taken }) => {
          let port = 7100;
          while (taken.has(port)) port++;
          return port;
        },
      },
    };
  }

  /** 连上并握手；subscribe 为 true 时订阅 playground 主题（桌面应用的样子），false 是命令行的样子 */
  async client(subscribe = true): Promise<Pump> {
    const client = await this.world.session(this.handle);
    const pump = new Pump(client);
    this.pumps.push(pump);
    if (subscribe) await pump.result("events.subscribe", { topics: ["playground", "settings"] });
    return pump;
  }

  async create(pump: Pump, name: string, extra: Record<string, unknown> = {}) {
    return pump.result<{
      playground: { id: string; name: string; path: string; port?: number };
      created: boolean;
    }>("playground.create", { template: "react19", name, createdBy: { kind: "user" }, ...extra });
  }

  async dispose(): Promise<void> {
    for (const pump of this.pumps) pump.stop();
    await this.world.dispose();
  }
}

it("harness: 现场能起一个带资源库方法的管理进程", async () => {
  const lw = new LibraryWorld();
  await lw.start();
  const pump = await lw.client();
  expect(await pump.result("playground.list", {})).toEqual([]);
  await lw.dispose();
});
