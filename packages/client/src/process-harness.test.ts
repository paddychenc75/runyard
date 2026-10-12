import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AbsPath,
  absPath,
  discoveryFilePath,
  getPlatform,
  type Platform,
  type ProcRef,
} from "@runyard/platform";
import { registerSpawned } from "@runyard/testing";
import { expect, it } from "vitest";
import type { ClientClock } from "./client-clock.ts";
import { createSystemClock } from "./client-clock.ts";
import type { ConnectOptions } from "./connect-options.ts";
import { readDiscoveryFile } from "./discovery.ts";
import type { RunyardClient } from "./runyard-client.ts";

// 进程阶段测试共用的工具：短前缀的临时主目录（socket 路径有 104 字节上限）、经平台层拉起真正的管理进程入口、
// 每个起过的进程按 pid 加启动时间登记（既登记给统一守卫，也在每个测试结束时核对无遗留）。绝不使用真实的 ~/.runyard。
// 管理进程入口文件的位置用相对路径找：client 不能导入 supervisor（layers.json），入口只是被当作命令运行。

export const SUPERVISOR_ENTRY = fileURLToPath(
  new URL("../../supervisor/src/main.ts", import.meta.url),
);

export function makeShortHome(): { home: AbsPath; remove(): void } {
  const home = absPath(realpathSync(mkdtempSync(join(tmpdir(), "ry-"))));
  return {
    home,
    remove: () => {
      // delete-allow: 测试自己建的临时主目录，不是用户的内容
      rmSync(home, { recursive: true, force: true });
    },
  };
}

/** 拉起管理进程的每一个进程都记账：包一层 spawnDetached，拿到 pid 后立刻取启动时间 */
export class Tracked {
  readonly platform: Platform;
  readonly refs: ProcRef[] = [];
  readonly home: AbsPath;
  readonly #base: Platform;

  constructor(home: AbsPath) {
    this.home = home;
    this.#base = getPlatform({ home, profile: undefined });
    this.platform = {
      ...this.#base,
      exec: {
        ...this.#base.exec,
        spawnDetached: async (argv, opts) => {
          const started = await this.#base.exec.spawnDetached(argv, opts);
          await this.trackPid(started.pid);
          return started;
        },
      },
    };
  }

  /** 登记一个进程（已退出的取不到身份，不用管） */
  async trackPid(pid: number): Promise<void> {
    const identity = await this.#base.proc.identity(pid);
    if (identity === null) return;
    if (this.refs.some((r) => r.pid === pid && r.startTime === identity.startTime)) return;
    const ref = { pid, startTime: identity.startTime };
    this.refs.push(ref);
    registerSpawned(this.#base, ref);
  }

  async isAlive(ref: ProcRef): Promise<boolean> {
    return (await this.#base.proc.identity(ref.pid))?.startTime === ref.startTime;
  }

  async alive(): Promise<ProcRef[]> {
    const result: ProcRef[] = [];
    for (const ref of this.refs) if (await this.isAlive(ref)) result.push(ref);
    return result;
  }

  /** 发现文件里的管理进程（pid 加启动时间），顺便登记 */
  async current(): Promise<ProcRef> {
    const file = await readDiscoveryFile(this.#base);
    if (file === undefined) throw new Error("no discovery file");
    await this.trackPid(file.pid);
    const ref = this.refs.find((r) => r.pid === file.pid);
    if (ref === undefined) throw new Error("supervisor is not running");
    return ref;
  }

  async kill(ref: ProcRef): Promise<void> {
    await this.#base.proc.terminate(ref, { mode: "kill", graceMs: 0 });
  }

  /** 收尾：还活着的强行结束，返回它们的 pid（正常的测试里应该是空的） */
  async reap(): Promise<number[]> {
    // 临时主目录是这个测试自己的，里面的发现文件只可能来自这个测试拉起的进程；
    // 测试中途失败时可能还没登记过它，这里补登记，免得漏掉
    await this.current().catch(() => undefined);
    const left = await this.alive();
    for (const ref of left) await this.kill(ref);
    return left.map((ref) => ref.pid);
  }

  /** 干净地关掉当前的管理进程并等它退出 */
  async stop(client: RunyardClient, ref: ProcRef): Promise<void> {
    await client.call("supervisor.shutdown", { ifIdle: false, reason: "user" });
    client.close();
    await waitUntil(async () => ((await this.isAlive(ref)) ? undefined : true), "supervisor exit");
  }

  options(build: string, overrides: Partial<ConnectOptions> = {}): ConnectOptions {
    return {
      platform: this.platform,
      client: { kind: "cli", version: "0.0.0-it", build },
      launch: { command: [process.execPath, SUPERVISOR_ENTRY] },
      ...overrides,
    };
  }

  /** 没有监听者了，发现文件也被管理进程清掉了 */
  async assertNothingLeft(): Promise<void> {
    await expect(this.#base.ipc.connect(300)).rejects.toMatchObject({
      error: { code: "SUPERVISOR_UNAVAILABLE" },
    });
    expect(await this.#base.fs.exists(discoveryFilePath(this.#base.paths.stateDir))).toBe(false);
  }
}

/** 轮询直到条件成立；这是在等真实进程，不是在等时间，所以用真实的短间隔 */
export async function waitUntil<T>(
  probe: () => Promise<T | undefined> | T | undefined,
  what: string,
  limitMs = 15_000,
): Promise<T> {
  const deadline = Date.now() + limitMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** 真实时钟，但睡眠被记下来；skip 为 true 时睡眠只推进“读到的时间”，不真的等（3 秒上限的测试用） */
export function recordingClock(skip = false): ClientClock & { sleeps: number[] } {
  const real = createSystemClock();
  let offset = 0;
  const sleeps: number[] = [];
  return {
    ...real,
    sleeps,
    now: () => real.now() + offset,
    sleep: async (ms) => {
      sleeps.push(ms);
      if (skip) offset += ms;
      else await real.sleep(ms);
    },
  };
}

// 本文件在单元阶段也会被收集（Windows 上没有平台实现），所以这里不碰真实平台
it("harness: 工具已就绪", () => {
  expect(typeof makeShortHome).toBe("function");
  expect(typeof Tracked).toBe("function");
});
