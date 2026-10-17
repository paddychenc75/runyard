import { basename } from "node:path";
import { PassThrough, Writable } from "node:stream";
import type {
  AbsPath,
  Env,
  ExitInfo,
  ManagedProcess,
  ProcMarker,
  ProcRef,
  TerminateMode,
} from "@runyard/platform";
import type { FakeClock } from "./fake-clock.ts";
import type { FakePorts } from "./fake-ports.ts";
import type { Proc, Sink } from "./fake-process-table.ts";
import type { MemoryFs } from "./memory-fs.ts";
import type {
  BehaviorSource,
  ProcessBehavior,
  ProcessMatcher,
  SpawnRecord,
  SpawnSpec,
} from "./process-behavior.ts";

const encoder = new TextEncoder();
const bytes = (data: string | Uint8Array): Uint8Array =>
  typeof data === "string" ? encoder.encode(data) : data;

// 假进程表：按剧本运行的进程树，全部由假时钟驱动。
// 只实现 Platform 的 exec 和 proc 需要的行为：输出、就绪（占端口）、自己退出、忽略礼貌停止、
// 起子进程、持有输出管道、进程号被复用。没有真实的子进程，所以测试里谁也不会被误杀。
export class FakeProcesses {
  readonly #clock: FakeClock;
  readonly #ports: FakePorts;
  readonly #fs: MemoryFs;
  readonly #polite: boolean;
  readonly #all: Proc[] = [];
  readonly #scripts: { match: ProcessMatcher; source: BehaviorSource }[] = [];
  readonly #deathListeners = new Set<() => void>();
  /** 被当作“终端会话首进程”的进程（见 attachTerminal） */
  readonly #terminalLeaders = new Set<Proc>();
  #nextPid = 4000;
  #lastStart = 0;
  readonly spawned: SpawnRecord[] = [];

  /** polite 为 false（caps.gracefulStop 是 none）时，礼貌的停止请求直接变成强制结束 */
  constructor(clock: FakeClock, ports: FakePorts, fs: MemoryFs, polite: boolean) {
    this.#polite = polite;
    this.#clock = clock;
    this.#ports = ports;
    this.#fs = fs;
  }

  /** 登记剧本；后登记的优先。没有任何剧本匹配的进程一直运行、没有输出，直到被停止 */
  when(match: ProcessMatcher, source: BehaviorSource): void {
    this.#scripts.unshift({ match, source });
  }

  spawn(spec: {
    argv: string[];
    cwd: AbsPath;
    env: SpawnSpec["env"];
    stdin: boolean;
  }): ManagedProcess {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const sink: Sink = {
      write: (stream, data) => (stream === "stdout" ? stdout : stderr).write(data),
      end: () => {
        stdout.end();
        stderr.end();
      },
    };
    const proc = this.#start(spec, sink);
    const received: string[] = [];
    const stdin = spec.stdin
      ? new Writable({
          write(chunk: Buffer, _encoding, done) {
            received.push(chunk.toString("utf8"));
            done();
          },
        })
      : null;
    this.#record(proc, spec, spec.stdin, null, () => received.join(""));
    const exited = this.#exited(proc);
    return { ref: proc.ref, stdin, stdout, stderr, exited };
  }

  async spawnDetached(
    argv: string[],
    opts: { env: SpawnSpec["env"]; logFile: AbsPath },
  ): Promise<{ pid: number }> {
    const spec = { argv, cwd: opts.logFile as AbsPath, env: opts.env };
    const sink: Sink = {
      write: (_stream, data) => {
        const old = this.#fs.exists(opts.logFile) ? this.#fs.readFile(opts.logFile) : "";
        this.#fs.writeFile(opts.logFile, old + new TextDecoder().decode(data));
      },
      end: () => {},
    };
    const proc = this.#start(spec, sink);
    this.#record(proc, spec, false, opts.logFile, () => "");
    return { pid: proc.ref.pid };
  }

  /**
   * 凭空出现一个不是我们启动的进程。给定一个已经被用过的 pid 但不同的 startTime，
   * 就是“进程号被复用”：旧的 ProcRef 再也对不上它，terminate 必须什么也不做。
   */
  addForeign(
    options: { pid?: number; startTime?: number; behavior?: ProcessBehavior; env?: Env } = {},
  ): ProcRef {
    const pid = options.pid ?? this.#allocatePid();
    if (this.#aliveByPid(pid) !== undefined) throw new Error(`pid ${pid} 现在被活着的进程占着`);
    const proc = this.#create({
      pid,
      startTime: options.startTime,
      name: "foreign",
      env: options.env ?? {},
      behavior: options.behavior ?? {},
      parent: null,
    });
    this.#run(proc);
    return proc.ref;
  }

  /** 这个进程自己退出了（比如被外力杀死）。已经结束的什么也不做 */
  exit(ref: ProcRef, exitCode: number | null = null): void {
    const proc = this.#find(ref);
    if (proc !== undefined) this.#die(proc, exitCode);
  }

  isAlive(ref: ProcRef): boolean {
    return this.#find(ref)?.alive === true;
  }

  /** 表里所有活着的进程，断言“没有残留”用 */
  alive(): ProcRef[] {
    return this.#all.filter((proc) => proc.alive).map((proc) => proc.ref);
  }

  // ---- Platform.proc ----

  async terminate(ref: ProcRef, o: { mode: TerminateMode; graceMs: number }): Promise<void> {
    const root = this.#find(ref);
    if (root === undefined) return; // pid 或启动时间对不上：进程不是我们的了
    if (this.#tree(root).length === 0) return;
    if (o.mode !== "kill" && this.#polite) {
      for (const member of this.#tree(root)) this.#askToStop(member);
      await this.#waitUntilEmpty(root, o.graceMs);
    }
    for (const member of this.#tree(root)) this.#die(member, null);
  }

  members(ref: ProcRef): number[] {
    const root = this.#find(ref);
    return root === undefined ? [] : this.#tree(root).map((proc) => proc.ref.pid);
  }

  /** 环境里带 name=value 的活进程，包括脱离进程组的后代（和真实现一样：读得到环境的才算） */
  findByMarker(marker: ProcMarker): ProcRef[] {
    return this.#all
      .filter((proc) => proc.alive && proc.env[marker.name] === marker.value)
      .map((proc) => proc.ref);
  }

  /**
   * 测试用：把这个进程当作某个终端的会话首进程（集成终端里的 shell）。之后它的全部后代，
   * 包括脱离进程组的，都共用这个控制终端，terminalMembers 找得到它们。真实的控制终端由 pty 带来
   */
  attachTerminal(ref: ProcRef): void {
    const proc = this.#find(ref);
    if (proc === undefined) throw new Error("没有这个进程");
    this.#terminalLeaders.add(proc);
  }

  /** 与 ref 共用控制终端的活进程（含它自己）；它不是会话首进程、已退出或身份对不上时为空 */
  terminalMembers(ref: ProcRef): ProcRef[] {
    const root = this.#find(ref);
    if (root === undefined || !root.alive || !this.#terminalLeaders.has(root)) return [];
    return [root, ...this.#descendants(root)].filter((proc) => proc.alive).map((proc) => proc.ref);
  }

  identity(pid: number): { startTime: number } | null {
    const found = this.#aliveByPid(pid);
    return found === undefined ? null : { startTime: found.ref.startTime };
  }

  // ---- 内部 ----

  #record(
    proc: Proc,
    spec: SpawnSpec,
    stdin: boolean,
    logFile: AbsPath | null,
    text: () => string,
  ) {
    this.spawned.push({
      ref: proc.ref,
      argv: spec.argv,
      cwd: spec.cwd,
      env: spec.env,
      stdin,
      logFile,
      stdinText: text,
    });
  }

  #start(spec: SpawnSpec, sink: Sink): Proc {
    const script = this.#scripts.find(({ match }) =>
      Array.isArray(match)
        ? match.length === spec.argv.length && match.every((part, i) => part === spec.argv[i])
        : (match as (s: SpawnSpec) => boolean)(spec),
    );
    const source = script?.source ?? {};
    const behavior = typeof source === "function" ? source(spec) : source;
    const proc = this.#create({
      name: basename(spec.argv[0] ?? "fake"),
      env: spec.env,
      behavior,
      parent: null,
    });
    proc.sink = sink;
    this.#run(proc);
    return proc;
  }

  #create(init: {
    pid?: number;
    startTime?: number;
    name: string;
    env: Env;
    behavior: ProcessBehavior;
    parent: Proc | null;
    detached?: boolean;
    holdsPipe?: boolean;
  }): Proc {
    // 启动时间严格递增，所以同一个 pid 被复用时一定对不上旧的
    this.#lastStart = Math.max(this.#lastStart + 1, this.#clock.now());
    const ref: ProcRef = {
      pid: init.pid ?? this.#allocatePid(),
      startTime: init.startTime ?? this.#lastStart,
    };
    const proc: Proc = {
      ref,
      name: init.name,
      env: init.env,
      behavior: init.behavior,
      parent: init.parent,
      detached: init.detached ?? false,
      holdsPipe: init.holdsPipe ?? false,
      pipeRoot: undefined as unknown as Proc,
      children: [],
      timers: [],
      exitWaiters: [],
      sink: null,
      sinkEnded: false,
      alive: true,
      exitInfo: null,
    };
    (proc as { pipeRoot: Proc }).pipeRoot = init.parent?.pipeRoot ?? proc;
    init.parent?.children.push(proc);
    this.#all.push(proc);
    return proc;
  }

  #run(proc: Proc): void {
    const { behavior } = proc;
    // 0 毫秒的事件在启动时同步发生：测试不必为“立刻输出、立刻退出”的进程去推进时钟
    const at = (ms: number, action: () => void) => {
      if (ms <= 0) {
        if (proc.alive) action();
        return;
      }
      proc.timers.push(
        this.#clock.setTimeout(() => {
          if (proc.alive) action();
        }, ms),
      );
    };
    for (const item of behavior.output ?? []) {
      at(item.atMs, () => this.#write(proc, item.stream, bytes(item.data)));
    }
    if (behavior.listenOn !== undefined) {
      const { port } = behavior.listenOn;
      at(behavior.listenOn.atMs, () => {
        if (this.#ports.status(port) !== "free") {
          this.#write(proc, "stderr", bytes(`listen EADDRINUSE 127.0.0.1:${port}\n`));
          this.#die(proc, 1);
          return;
        }
        this.#ports.occupy(port, { pid: proc.ref.pid, name: proc.name });
      });
    }
    if (behavior.exit !== undefined) {
      const { code } = behavior.exit;
      at(behavior.exit.afterMs, () => this.#die(proc, code));
    }
    for (const child of behavior.children ?? []) {
      at(child.atMs, () => {
        const made = this.#create({
          name: "child",
          env: proc.env,
          behavior: child.behavior ?? {},
          parent: proc,
          detached: child.detached,
          holdsPipe: child.holdsOutputPipe,
        });
        this.#run(made);
      });
    }
  }

  #write(proc: Proc, stream: "stdout" | "stderr", data: Uint8Array): void {
    const root = proc.pipeRoot;
    if (root.sink !== null && !root.sinkEnded) root.sink.write(stream, data);
  }

  #die(proc: Proc, exitCode: number | null): void {
    if (!proc.alive) return;
    proc.alive = false;
    proc.exitInfo = { exitCode };
    for (const timer of proc.timers) this.#clock.clearTimeout(timer);
    for (const port of this.#ports.heldBy(proc.ref.pid)) {
      const delay = proc.behavior.portReleaseDelayMs ?? 0;
      if (delay > 0) this.#ports.releaseAfter(port, delay);
      else this.#ports.release(port);
    }
    for (const waiter of proc.exitWaiters) waiter({ exitCode });
    this.#closePipeIfDone(proc.pipeRoot);
    for (const listener of [...this.#deathListeners]) listener();
  }

  #exited(proc: Proc): Promise<ExitInfo> {
    const done = proc.exitInfo;
    return done !== null
      ? Promise.resolve(done)
      : new Promise<ExitInfo>((resolve) => proc.exitWaiters.push(resolve));
  }

  // 根进程已退出且没有后代还握着管道，输出流才算结束（决策记录 0006：只等退出，不等管道）
  #closePipeIfDone(root: Proc): void {
    if (root.sink === null || root.sinkEnded || root.alive) return;
    const holders = this.#descendants(root).filter((proc) => proc.holdsPipe && proc.alive);
    if (holders.length > 0) return;
    root.sinkEnded = true;
    root.sink.end();
  }

  #askToStop(proc: Proc): void {
    if (proc.behavior.ignoresStop === true) return;
    const die = () => this.#die(proc, proc.behavior.stopExitCode ?? 0);
    const delay = proc.behavior.stopDelayMs ?? 0;
    if (delay > 0) proc.timers.push(this.#clock.setTimeout(die, delay));
    else die();
  }

  #waitUntilEmpty(root: Proc, graceMs: number): Promise<void> {
    return new Promise((resolve) => {
      const finish = () => {
        this.#clock.clearTimeout(timer);
        this.#deathListeners.delete(check);
        resolve();
      };
      const check = () => {
        if (this.#tree(root).length === 0) finish();
      };
      const timer = this.#clock.setTimeout(finish, graceMs);
      this.#deathListeners.add(check);
      check();
    });
  }

  // 记录（含已死的）按 pid 和启动时间精确匹配；pid 被别人复用后，旧引用找到的仍是旧记录
  #find(ref: ProcRef): Proc | undefined {
    return this.#all.find((p) => p.ref.pid === ref.pid && p.ref.startTime === ref.startTime);
  }

  #aliveByPid(pid: number): Proc | undefined {
    return this.#all.find((p) => p.alive && p.ref.pid === pid);
  }

  #allocatePid(): number {
    while (this.#aliveByPid(this.#nextPid) !== undefined) this.#nextPid++;
    return this.#nextPid++;
  }

  #descendants(root: Proc): Proc[] {
    return root.children.flatMap((child) => [child, ...this.#descendants(child)]);
  }

  // 整棵树里活着的成员：根加上没有脱离的后代（脱离的子树整体排除）
  #tree(root: Proc): Proc[] {
    const walk = (proc: Proc): Proc[] => [
      ...(proc.alive ? [proc] : []),
      ...proc.children.filter((child) => !child.detached).flatMap(walk),
    ];
    return walk(root);
  }
}
