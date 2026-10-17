import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AbsPath,
  absPath,
  getPlatform,
  type ManagedProcess,
  type Platform,
} from "@runyard/platform";
import { type SupervisorFile, supervisorFileSchema } from "@runyard/protocol";
import { registerSpawned } from "@runyard/testing";
import { expect, it } from "vitest";
import { supervisorEntryPath } from "./index.ts";

// 进程测试共用的工具：短前缀的临时主目录（socket 路径有 104 字节上限）、经 platform.exec 起真正的管理进程入口、
// 每个进程按 pid 加启动时间登记（进程阶段每个文件结束后有统一守卫核对无遗留）。绝不使用真实的 ~/.runyard。
// 放在 *.test.ts 里是因为只有测试文件能导入 @runyard/testing。

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

export function platformAt(home: AbsPath, profile: "dev" | undefined = undefined): Platform {
  return getPlatform({ home, profile });
}

export interface RunningSupervisor {
  readonly process: ManagedProcess;
  readonly pid: number;
  readonly stderr: () => string;
  /** 退出码；被强行结束时是 null */
  readonly exited: Promise<number | null>;
  hasExited(): boolean;
}

export class ProcessLedger {
  readonly #platform: Platform;
  readonly #started: RunningSupervisor[] = [];

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  /** 起一个真正的管理进程（普通 Node 跑入口文件） */
  startSupervisor(
    home: AbsPath,
    extraArgs: readonly string[] = [],
    build = "0.0.0-it+one",
  ): RunningSupervisor {
    const argv = [
      process.execPath,
      supervisorEntryPath(),
      "--home",
      home,
      "--version",
      "0.0.0-it",
      "--build",
      build,
      ...extraArgs,
    ];
    const child = this.#platform.exec.spawn({ argv, cwd: home, env: {}, stdin: false });
    registerSpawned(this.#platform, child.ref);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.stdout.resume();
    let exited = false;
    const exitCode = child.exited.then((info) => {
      exited = true;
      return info.exitCode;
    });
    const running: RunningSupervisor = {
      process: child,
      pid: child.ref.pid,
      stderr: () => stderr,
      exited: exitCode,
      hasExited: () => exited,
    };
    this.#started.push(running);
    return running;
  }

  /** 强行结束（核对 pid 加启动时间）：模拟被强杀 */
  async kill(running: RunningSupervisor): Promise<void> {
    await this.#platform.proc.terminate(running.process.ref, { mode: "kill", graceMs: 0 });
    await running.exited;
  }

  /** 礼貌地请求退出（终止信号） */
  async terminate(running: RunningSupervisor): Promise<void> {
    await this.#platform.proc.terminate(running.process.ref, { mode: "graceful", graceMs: 5000 });
  }

  /** 结束仍活着的（terminate 自己核对身份），返回它们的 pid——正常的测试里应该是空的 */
  async reap(): Promise<number[]> {
    const left: number[] = [];
    for (const running of this.#started) {
      const now = await this.#platform.proc.identity(running.pid);
      if (now === null || now.startTime !== running.process.ref.startTime) continue;
      left.push(running.pid);
      await this.#platform.proc.terminate(running.process.ref, { mode: "kill", graceMs: 0 });
    }
    return left;
  }

  /** 起过的进程里现在还活着的 pid */
  async alive(): Promise<number[]> {
    const result: number[] = [];
    for (const running of this.#started) {
      const now = await this.#platform.proc.identity(running.pid);
      if (now !== null && now.startTime === running.process.ref.startTime) result.push(running.pid);
    }
    return result;
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

/**
 * 读发现文件，没有就是 undefined。不能先 existsSync 再读：新的管理进程启动时会删掉上次留下的旧文件，
 * 夹在两步之间就读到 ENOENT（#225）。只有“文件不存在”算没有，其他错误照常抛。
 * 读取函数可注入，单元测试用它模拟夹在中间被删。
 */
export function readDiscoveryFile(
  path: string,
  read: (path: string) => string = (p) => readFileSync(p, "utf8"),
): SupervisorFile | undefined {
  let text: string;
  try {
    text = read(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const parsed = supervisorFileSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : undefined;
}

// 本文件在单元阶段也会被收集（Windows 上没有平台实现），所以这里不碰真实平台
it("harness: 工具已就绪", () => {
  expect(typeof makeShortHome).toBe("function");
  expect(typeof ProcessLedger).toBe("function");
});

it("[SUPERVISOR-LIFECYCLE-03] 读发现文件时文件正好被新的管理进程删掉：当作没有，不抛 ENOENT（#225）", () => {
  const gone = () => {
    throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" });
  };
  expect(readDiscoveryFile("/nonexistent/supervisor.json", gone)).toBeUndefined();
  const denied = () => {
    throw Object.assign(new Error("EACCES"), { code: "EACCES" });
  };
  expect(() => readDiscoveryFile("/nonexistent/supervisor.json", denied)).toThrow("EACCES");
});
