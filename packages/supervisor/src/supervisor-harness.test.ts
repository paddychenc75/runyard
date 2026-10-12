import type { SupervisorFile } from "@runyard/protocol";
import { createFakePlatform, FakeClock, type FakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type { DiscoveryStore } from "./discovery-file.ts";
import { startSupervisor } from "./start-supervisor.ts";
import type { StartSupervisorOptions, SupervisorHandle } from "./supervisor-options.ts";
import { TestClient, tokenBytes } from "./test-client.ts";

// 管理进程单元测试共用的现场：假平台（loopback 上的 socket）、假时钟、内存里的发现文件。
// 放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing（testing-imports 检查）。

export interface MemoryDiscovery extends DiscoveryStore {
  file: SupervisorFile | undefined;
  /** 写入和删除的顺序，用来断言启动顺序 */
  readonly log: string[];
}

export function memoryDiscovery(): MemoryDiscovery {
  const store: MemoryDiscovery = {
    file: undefined,
    log: [],
    async write(file) {
      store.log.push("write");
      store.file = file;
    },
    async remove() {
      store.log.push("remove");
      store.file = undefined;
    },
  };
  return store;
}

export const identity = {
  protocol: 1,
  minClientProtocol: 1,
  version: "0.0.0-test",
  build: "0.0.0-test+aaaa",
  startedBy: "cli",
} as const;

export class World {
  readonly fake: FakePlatform;
  readonly clock: FakeClock;
  readonly discovery = memoryDiscovery();
  readonly handles: SupervisorHandle[] = [];
  readonly clients: TestClient[] = [];

  constructor() {
    this.clock = new FakeClock();
    this.fake = createFakePlatform({ clock: this.clock });
  }

  async start(overrides: Partial<StartSupervisorOptions> = {}): Promise<SupervisorHandle> {
    const handle = await startSupervisor({
      platform: this.fake.platform,
      identity,
      host: "node",
      execPath: process.execPath,
      clock: this.clock,
      discovery: this.discovery,
      ...overrides,
    });
    this.handles.push(handle);
    return handle;
  }

  async connect(): Promise<TestClient> {
    const client = await TestClient.connect(this.fake.platform);
    this.clients.push(client);
    return client;
  }

  /** 连上并走完握手 */
  async session(
    handle: SupervisorHandle,
    options: Parameters<TestClient["handshake"]>[2] = {},
  ): Promise<TestClient> {
    const client = await this.connect();
    await client.handshake(this.fake.platform, tokenBytes(handle.token), options);
    return client;
  }

  async dispose(): Promise<void> {
    for (const client of this.clients) client.destroy();
    for (const handle of this.handles) await handle.api.shutdown("user");
    await this.fake.dispose();
  }
}

it("harness: 现场能起一个管理进程并关掉", async () => {
  const world = new World();
  const handle = await world.start();
  expect(world.discovery.file?.token).toBe(handle.token);
  await world.dispose();
  expect(world.discovery.file).toBeUndefined();
});
