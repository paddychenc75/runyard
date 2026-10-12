import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AbsPath, absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import { supervisorEntryPath } from "./index.ts";

// 集成测试用的小工具：短前缀的临时主目录（socket 路径有 104 字节上限）、起真正的管理进程入口、
// 把每个起过的进程按 pid 加启动时间记账，收尾时核对身份再结束，并报告有没有进程漏网。
// 绝不使用真实的 ~/.runyard。不是产品代码，不从入口导出。

export function makeShortHome(): { home: AbsPath; remove(): void } {
  const home = absPath(realpathSync(mkdtempSync(join(tmpdir(), "ry-"))));
  return { home, remove: () => rmSync(home, { recursive: true, force: true }) };
}

export interface RunningSupervisor {
  readonly child: ChildProcess;
  readonly ref: ProcRef;
  readonly stderr: () => string;
  /** 退出码；被信号结束时是 null */
  readonly exited: Promise<number | null>;
  hasExited(): boolean;
}

export class ProcessLedger {
  readonly #platform: Platform;
  readonly #refs: ProcRef[] = [];

  constructor(platform: Platform) {
    this.#platform = platform;
  }

  /** 起一个真正的管理进程（普通 Node 跑入口文件），并把它记账 */
  async startSupervisor(
    home: AbsPath,
    extraArgs: readonly string[] = [],
    build = "0.0.0-it+one",
  ): Promise<RunningSupervisor> {
    const args = [
      supervisorEntryPath(),
      "--home",
      home,
      "--version",
      "0.0.0-it",
      "--build",
      build,
      ...extraArgs,
    ];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    let exited = false;
    const exitPromise = new Promise<number | null>((resolve) => {
      child.once("exit", (code) => {
        exited = true;
        resolve(code);
      });
    });
    const pid = child.pid;
    if (pid === undefined) throw new Error("failed to spawn the supervisor entry");
    const identity = await this.#platform.proc.identity(pid);
    const ref: ProcRef = { pid, startTime: identity?.startTime ?? 0 };
    this.#refs.push(ref);
    return { child, ref, stderr: () => stderr, exited: exitPromise, hasExited: () => exited };
  }

  /** 登记别处起的进程（比如抢占连接点的占位者） */
  async track(pid: number): Promise<void> {
    const identity = await this.#platform.proc.identity(pid);
    if (identity !== null) this.#refs.push({ pid, startTime: identity.startTime });
  }

  /** 记过账的进程里现在还活着的（pid 和启动时间都对得上） */
  async alive(): Promise<ProcRef[]> {
    const result: ProcRef[] = [];
    for (const ref of this.#refs) {
      const now = await this.#platform.proc.identity(ref.pid);
      if (now !== null && now.startTime === ref.startTime) result.push(ref);
    }
    return result;
  }

  /** 强行结束仍活着的（terminate 自己会核对身份），返回它们——正常的测试里应该是空的 */
  async reap(): Promise<ProcRef[]> {
    const survivors = await this.alive();
    for (const ref of survivors) {
      await this.#platform.proc.terminate(ref, { mode: "kill", graceMs: 0 });
    }
    return survivors;
  }
}

export function platformAt(home: AbsPath, profile: "dev" | undefined = undefined): Platform {
  return getPlatform({ home, profile });
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
