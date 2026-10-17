import { fileURLToPath } from "node:url";
import { type AbsPath, absPath, getPlatform, type Platform, type ProcRef } from "@runyard/platform";
import type { HostCommand, HostEvent } from "../../../shared/pty-host-messages.ts";
import type { PtyHostLink } from "../terminal-service.ts";

// 独立进程里的 pty-host（标准输入输出传消息）：和 utilityProcess 里的一样是个独立进程，
// 被强制结束时会真的死掉，伪终端的主端随之关闭。起停都经平台层，进程按 pid 加启动时间登记给遗留进程守卫。

const STDIO_MAIN = fileURLToPath(
  new URL("../../../pty-host/test-support/stdio-main.ts", import.meta.url),
);
const SPAWNED_KEY = Symbol.for("runyard.test.spawned-processes");

function register(platform: Platform, ref: ProcRef): void {
  const holder = globalThis as unknown as Record<
    symbol,
    Set<{ pid: number; alive(): Promise<boolean>; kill(): void }> | undefined
  >;
  const registry = holder[SPAWNED_KEY] ?? new Set();
  holder[SPAWNED_KEY] = registry;
  registry.add({
    pid: ref.pid,
    alive: async () => (await platform.proc.identity(ref.pid))?.startTime === ref.startTime,
    kill: () => {
      try {
        process.kill(-ref.pid, "SIGKILL");
      } catch {
        // 刚好没了
      }
    },
  });
}

export class ProcessHostLink implements PtyHostLink {
  readonly ref: ProcRef;
  readonly #stdin: NodeJS.WritableStream | null;
  readonly #events: ((event: HostEvent) => void)[] = [];
  readonly #exits: (() => void)[] = [];
  readonly exited: Promise<void>;

  readonly #platform: Platform;

  constructor(platform: Platform, parentPid: number, cwd: AbsPath) {
    this.#platform = platform;
    const child = platform.exec.spawn({
      argv: [process.execPath, STDIO_MAIN, String(parentPid)],
      cwd,
      env: { ...process.env, PATH: process.env.PATH ?? "" } as Record<string, string>,
      stdin: true,
    });
    this.ref = child.ref;
    register(platform, child.ref);
    this.#stdin = child.stdin;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      for (let at = buffer.indexOf("\n"); at !== -1; at = buffer.indexOf("\n")) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        if (line === "") continue;
        const event = JSON.parse(line) as HostEvent;
        for (const listener of this.#events) listener(event);
      }
    });
    child.stderr.resume();
    this.exited = child.exited.then(() => {
      for (const listener of this.#exits) listener();
    });
  }

  post(command: HostCommand): void {
    this.#stdin?.write(`${JSON.stringify(command)}\n`);
  }
  onEvent(listener: (event: HostEvent) => void): void {
    this.#events.push(listener);
  }
  onExit(listener: () => void): void {
    this.#exits.push(listener);
  }
  kill(): void {
    void this.#platform.proc.terminate(this.ref, { mode: "graceful", graceMs: 500 });
  }
  /** 强制结束（kill -9）：像崩溃一样没有任何收尾 */
  async crash(): Promise<void> {
    await this.#platform.proc.terminate(this.ref, { mode: "kill", graceMs: 0 });
    await this.exited;
  }
}

/** 一个什么都不做的长命进程，当作“应用本身”：结束它就是“应用被强制结束” */
export function spawnStandIn(platform: Platform, cwd: AbsPath): ProcRef {
  const child = platform.exec.spawn({
    argv: ["/bin/sleep", "600"],
    cwd,
    env: { PATH: "/usr/bin:/bin" },
    stdin: false,
  });
  register(platform, child.ref);
  return child.ref;
}

export { absPath, getPlatform };
