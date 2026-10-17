import type { HostEvent } from "../../shared/pty-host-messages.ts";
import type { HostDeps, PtyLike, PtySpawnOptions } from "../host.ts";

// 假的伪终端和平台层，给 pty-host 的核心逻辑用：不起任何真进程。

export class FakePty implements PtyLike {
  process = "zsh";
  readonly written: string[] = [];
  readonly resized: { cols: number; rows: number }[] = [];
  readonly killed: (string | undefined)[] = [];
  pauses = 0;
  resumes = 0;
  readonly #data: ((data: string) => void)[] = [];
  readonly #exit: ((event: { exitCode: number }) => void)[] = [];

  readonly pid: number;
  /** kill 时是否像真的 shell 那样退出（退出码 129，被 SIGHUP） */
  readonly #exitOnKill: boolean;

  constructor(pid: number, exitOnKill = true) {
    this.pid = pid;
    this.#exitOnKill = exitOnKill;
  }

  onData(listener: (data: string) => void): void {
    this.#data.push(listener);
  }
  onExit(listener: (event: { exitCode: number }) => void): void {
    this.#exit.push(listener);
  }
  write(data: string): void {
    this.written.push(data);
  }
  resize(cols: number, rows: number): void {
    this.resized.push({ cols, rows });
  }
  pause(): void {
    this.pauses += 1;
  }
  resume(): void {
    this.resumes += 1;
  }
  kill(signal?: string): void {
    this.killed.push(signal);
    if (this.#exitOnKill) this.emitExit(129);
  }
  emitData(data: string): void {
    for (const listener of this.#data) listener(data);
  }
  emitExit(exitCode: number): void {
    for (const listener of this.#exit) listener({ exitCode });
  }
}

export interface SpawnCall {
  file: string;
  args: string[];
  options: PtySpawnOptions;
  pty: FakePty;
}

export interface Harness {
  deps: HostDeps;
  events: HostEvent[];
  spawns: SpawnCall[];
  terminated: { pid: number; startTime: number; mode: string }[];
  /** 问过的终端标记 */
  markersAsked: { name: string; value: string }[];
  /** findByMarker 会返回的脱离进程组的残余进程 */
  strays: number[];
}

/** 每次 spawn 依次取 behaviors 里的一项；没有就是普通能起来的 shell（起来后马上有一段输出） */
export function harness(
  options: {
    login?: string | undefined;
    check?: (
      path: string,
    ) => "ok" | "not-found" | "not-executable" | "spawn-failed" | "exited-early";
    behaviors?: ("normal" | "exit-early" | "throw")[];
    baseEnv?: Record<string, string>;
  } = {},
): Harness {
  const events: HostEvent[] = [];
  const spawns: SpawnCall[] = [];
  const terminated: Harness["terminated"] = [];
  const markersAsked: Harness["markersAsked"] = [];
  const strays: number[] = [];
  const behaviors = [...(options.behaviors ?? [])];
  let nextPid = 1000;
  const deps: HostDeps = {
    spawn: (file, args, spawnOptions) => {
      const behavior = behaviors.shift() ?? "normal";
      if (behavior === "throw") throw new Error("posix_spawnp failed.");
      const pty = new FakePty(nextPid++);
      spawns.push({ file, args, options: spawnOptions, pty });
      if (behavior === "exit-early") queueMicrotask(() => pty.emitExit(1));
      else queueMicrotask(() => pty.emitData("prompt% "));
      return pty;
    },
    send: (event) => events.push(event),
    proc: {
      identity: async (pid) => ({ startTime: pid * 10 }),
      findByMarker: async (marker) => {
        markersAsked.push(marker);
        return strays.map((pid) => ({ pid, startTime: pid * 10 }));
      },
      terminate: async (ref, o) => {
        terminated.push({ pid: ref.pid, startTime: ref.startTime, mode: o.mode });
      },
    },
    loginShell: async () => options.login ?? "/bin/zsh",
    checkShell: async (path) => options.check?.(path) ?? "ok",
    baseEnv: options.baseEnv ?? {
      PATH: "/usr/bin:/bin",
      ELECTRON_RUN_AS_NODE: "1",
      HOME: "/home/u",
    },
    earlyExitMs: 20,
    graceMs: 50,
  };
  return { deps, events, spawns, terminated, markersAsked, strays };
}
