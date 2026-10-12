import { dirname } from "node:path/posix";
import { absPath, type Platform } from "@runyard/platform";
import { createFakePlatform, FakeClock, type FakePlatform } from "@runyard/testing";
import { expect, it } from "vitest";
import type { ClientClock } from "./client-clock.ts";
import type { ConnectOptions } from "./connect-options.ts";
import { TestSupervisor, type TestSupervisorOptions } from "./test-supervisor.ts";

// 客户端单元测试共用的现场：假平台（loopback 上的 socket、内存文件系统）、假时钟（睡眠就是推进时间）、
// 记下每次 spawnDetached 的启动者。放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。

export interface Spawned {
  argv: string[];
  env: Record<string, string>;
  logFile: string;
}

const live = new Set<World>();

/** 每个测试文件的 afterEach 调它：收掉这个文件里建过的所有现场 */
export async function disposeWorlds(): Promise<void> {
  for (const world of [...live]) await world.dispose();
}

export class World {
  readonly fake: FakePlatform;
  readonly clock = new FakeClock();
  readonly platform: Platform;
  readonly sleeps: number[] = [];
  readonly spawned: Spawned[] = [];
  readonly supervisors: TestSupervisor[] = [];
  /** 拉起管理进程时要做的事（测试里启动一个新的测试管理进程） */
  onSpawn: (() => Promise<void>) | undefined;
  /** 每次睡眠之后调用，按假时间决定管理进程什么时候“起来” */
  afterSleep: (() => Promise<void>) | undefined;
  spawnFails = false;

  constructor() {
    live.add(this);
    this.fake = createFakePlatform({ clock: this.clock });
    const base = this.fake.platform;
    this.platform = {
      ...base,
      exec: {
        ...base.exec,
        spawnDetached: async (argv, opts) => {
          if (this.spawnFails) throw new Error("spawn refused");
          this.spawned.push({ argv, env: { ...opts.env }, logFile: opts.logFile });
          await this.onSpawn?.();
          return { pid: 6000 + this.spawned.length };
        },
      },
    };
  }

  get clientClock(): ClientClock {
    return {
      now: () => this.clock.now(),
      sleep: async (ms) => {
        this.sleeps.push(ms);
        await this.clock.advance(ms);
        await this.afterSleep?.();
      },
      setTimeout: (callback, ms) => this.clock.setTimeout(callback, ms),
      clearTimeout: (id) => this.clock.clearTimeout(id),
    };
  }

  async supervisor(options: Omit<TestSupervisorOptions, "platform"> = {}): Promise<TestSupervisor> {
    const supervisor = await TestSupervisor.start({ platform: this.platform, ...options });
    this.supervisors.push(supervisor);
    return supervisor;
  }

  /** 让发现文件里记的可执行文件“存在” */
  async makeExecutable(path: string): Promise<void> {
    await this.platform.fs.makeDir(absPath(dirname(path)));
    await this.platform.fs.writeFile(absPath(path), "");
  }

  options(overrides: Partial<ConnectOptions> = {}): ConnectOptions {
    return {
      platform: this.platform,
      client: { kind: "cli", version: "1.0.0", build: "1.0.0+aaaa", pid: 777 },
      launch: { command: ["/fake/node", "/fake/supervisor-main.ts"] },
      clock: this.clientClock,
      ...overrides,
    };
  }

  async dispose(): Promise<void> {
    live.delete(this);
    for (const supervisor of this.supervisors) await supervisor.stop();
    await this.fake.dispose();
  }
}

it("harness: 现场能起一个测试管理进程并关掉", async () => {
  const world = new World();
  const supervisor = await world.supervisor();
  await supervisor.publishDiscovery();
  expect(supervisor.token).toMatch(/^[0-9a-f]{64}$/);
  await world.dispose();
});
