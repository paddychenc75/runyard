import { basename } from "node:path";
import type { Platform, ProcRef } from "@runyard/platform";
import type { HostCommand, HostEvent } from "../shared/pty-host-messages.ts";
import {
  FALLBACK_SHELL,
  type ShellFailure,
  type ShellNotice,
  TERMINAL_MARKER_ENV,
} from "../shared/terminal.ts";
import { buildTerminalEnv, isIdleForeground, loginShellCommand } from "./terminal-env.ts";

// pty-host 的核心（技术设计 §6.3）：每个项目一个伪终端，里面是用户的登录 shell。
// 这个文件不碰 node-pty 和 Electron：伪终端、平台层、消息出口都从构造参数传进来，所以能用假的整个测；
// 真的接线在 index.ts。

/** node-pty 的 IPty 里这里用到的部分 */
export interface PtyLike {
  readonly pid: number;
  /** 前台进程名；空闲在提示符时就是 shell 自己 */
  readonly process: string;
  onData(listener: (data: string) => void): unknown;
  onExit(listener: (event: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(signal?: string): void;
}

export interface PtySpawnOptions {
  cwd: string;
  env: Record<string, string>;
  cols: number;
  rows: number;
}
export type PtySpawner = (file: string, args: string[], options: PtySpawnOptions) => PtyLike;

export interface HostDeps {
  spawn: PtySpawner;
  send(event: HostEvent): void;
  proc: Pick<Platform["proc"], "terminate" | "identity" | "findByMarker">;
  /** 用户的登录 shell（取自系统的用户记录，不看环境变量）；查不到是 undefined */
  loginShell(): Promise<string | undefined>;
  /** shell 文件能不能执行 */
  checkShell(path: string): Promise<"ok" | ShellFailure>;
  /** pty-host 自己的环境 */
  baseEnv: Readonly<Record<string, string | undefined>>;
  /** 启动后这么久还活着（或已有输出）才算起来了；立刻退出的 shell 要改用 /bin/zsh */
  earlyExitMs: number;
  /** 结束终端时先礼貌请求、过了这么久再强制结束 */
  graceMs: number;
}

/** 没处理的输出超过这么多就让伪终端暂停；降到 LOW_WATER 以下再继续（字符数） */
export const HIGH_WATER = 1_048_576;
export const LOW_WATER = 262_144;
/** 结束时最多等 shell 的退出事件这么久 */
const EXIT_WAIT_MS = 2000;

interface Session {
  readonly pty: PtyLike;
  readonly shell: string;
  ref: ProcRef | null;
  /** 这个终端的标记值：shell 和它启动的一切命令的环境里都有 */
  readonly marker: string;
  /** 已发给主进程、还没收到回执的字符数 */
  unacked: number;
  paused: boolean;
  /** 起来了（有输出或撑过了 earlyExitMs）；之前的退出算“没起来”，不报给主进程 */
  decided: boolean;
  ending: boolean;
  exited: boolean;
  /** 退出事件到了就兑现 */
  readonly exitSettled: Promise<void>;
}

export class PtyHost {
  readonly #deps: HostDeps;
  readonly #sessions = new Map<string, Session>();
  /** 正在启动（还没登记会话）的项目：同一个项目的第二个 open 不重复开 */
  readonly #opening = new Set<string>();

  constructor(deps: HostDeps) {
    this.#deps = deps;
  }

  /** 处理主进程的一条命令；处理中的失败不抛出（一个项目的终端出错不连累别的） */
  handle(command: HostCommand): void {
    void this.#dispatch(command).catch(() => {
      // 单个命令失败只影响这一个终端：open 失败已经报了 start-failed，其余无处可报
    });
  }

  async #dispatch(command: HostCommand): Promise<void> {
    const session = this.#sessions.get(command.project);
    switch (command.type) {
      case "open":
        if (session !== undefined || this.#opening.has(command.project)) return;
        this.#opening.add(command.project);
        try {
          await this.#open(command);
        } finally {
          this.#opening.delete(command.project);
        }
        return;
      case "write":
        if (session !== undefined && !session.ending) session.pty.write(command.data);
        return;
      case "resize":
        if (session !== undefined && !session.ending)
          session.pty.resize(command.cols, command.rows);
        return;
      case "ack":
        if (session !== undefined) this.#acknowledge(session, command.length);
        return;
      case "foreground":
        this.#deps.send({
          type: "foreground",
          project: command.project,
          id: command.id,
          command: session === undefined ? null : this.#foreground(session),
        });
        return;
      case "end":
        await this.#end(command.project);
        this.#deps.send({ type: "closed", project: command.project, id: command.id });
        return;
    }
  }

  /** 结束全部终端（应用退出、后台进程要走了） */
  async dispose(): Promise<void> {
    await Promise.all([...this.#sessions.keys()].map((project) => this.#end(project)));
  }

  #foreground(session: Session): string | null {
    let name: string;
    try {
      name = session.pty.process;
    } catch {
      return null;
    }
    return name === "" || isIdleForeground(name, session.shell) ? null : basename(name);
  }

  #acknowledge(session: Session, length: number): void {
    session.unacked = Math.max(0, session.unacked - length);
    if (session.paused && session.unacked <= LOW_WATER) {
      session.paused = false;
      session.pty.resume();
    }
  }

  async #open(command: Extract<HostCommand, { type: "open" }>): Promise<void> {
    const login = await this.#deps.loginShell();
    const candidates = [...new Set([...(login === undefined ? [] : [login]), FALLBACK_SHELL])];
    let notice: ShellNotice | undefined;
    for (const shell of candidates) {
      const failure = await this.#tryStart(command, shell, notice);
      if (failure === null) return;
      // 只有登录 shell 起不来才说明；/bin/zsh 也起不来就没有可退的了
      if (shell === login && notice === undefined) {
        notice = { code: "SHELL_FALLBACK", shell, reason: failure };
      }
    }
    this.#deps.send({ type: "start-failed", project: command.project });
  }

  /** 试着用这个 shell 开终端；成功返回 null，失败返回原因 */
  async #tryStart(
    command: Extract<HostCommand, { type: "open" }>,
    shell: string,
    notice: ShellNotice | undefined,
  ): Promise<ShellFailure | null> {
    const checked = await this.#deps.checkShell(shell);
    if (checked !== "ok") return checked;
    const env = buildTerminalEnv({
      base: this.#deps.baseEnv,
      extra: { ...command.env, [TERMINAL_MARKER_ENV]: command.marker },
      shell,
      runyardBinDir: command.runyardBinDir,
    });
    const { file, args } = loginShellCommand(shell);
    let pty: PtyLike;
    try {
      pty = this.#deps.spawn(file, args, {
        cwd: command.cwd,
        env,
        cols: command.cols,
        rows: command.rows,
      });
    } catch {
      return "spawn-failed";
    }
    let settleExit: () => void = () => {};
    const session: Session = {
      pty,
      shell,
      ref: null,
      marker: command.marker,
      unacked: 0,
      paused: false,
      decided: false,
      ending: false,
      exited: false,
      exitSettled: new Promise<void>((resolve) => {
        settleExit = resolve;
      }),
    };
    this.#sessions.set(command.project, session);

    const early = await new Promise<"ok" | "exited">((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const decide = (outcome: "ok" | "exited"): void => {
        if (session.decided) return;
        session.decided = outcome === "ok";
        if (timer !== undefined) clearTimeout(timer);
        resolve(outcome);
      };
      timer = setTimeout(() => decide("ok"), this.#deps.earlyExitMs);
      pty.onData((data) => {
        if (session.exited && !session.decided) return;
        decide("ok");
        session.unacked += data.length;
        this.#deps.send({ type: "data", project: command.project, data });
        if (!session.paused && session.unacked > HIGH_WATER) {
          session.paused = true;
          pty.pause();
        }
      });
      pty.onExit(({ exitCode }) => {
        session.exited = true;
        settleExit();
        const wasDecided = session.decided;
        decide("exited");
        if (!wasDecided) {
          // 没起来就退出了：这个会话作废，换下一个 shell
          if (this.#sessions.get(command.project) === session)
            this.#sessions.delete(command.project);
          return;
        }
        if (this.#sessions.get(command.project) === session) this.#sessions.delete(command.project);
        this.#deps.send({
          type: "exit",
          project: command.project,
          exitCode,
          requested: session.ending,
        });
      });
    });
    if (early === "exited") return "exited-early";

    const identity = await this.#deps.proc.identity(pty.pid).catch(() => null);
    session.ref = identity === null ? null : { pid: pty.pid, startTime: identity.startTime };
    this.#deps.send({
      type: "started",
      project: command.project,
      pid: pty.pid,
      startTime: identity?.startTime ?? null,
      shell,
      ...(notice === undefined ? {} : { notice }),
    });
    return null;
  }

  /** 结束一个终端：先让 shell 退出（它会带走自己的作业），再整组收尾，最后确认退出事件到了 */
  async #end(project: string): Promise<void> {
    const session = this.#sessions.get(project);
    if (session === undefined) return;
    session.ending = true;
    try {
      session.pty.kill();
    } catch {
      // 已经退出了
    }
    await Promise.race([session.exitSettled, delay(Math.min(300, this.#deps.graceMs))]);
    if (session.ref !== null) {
      // 后台作业、被 shell 另起进程组的命令都在这一组（或随组长退出后留下）：整组收尾，每次发信号前核对身份
      await this.#deps.proc
        .terminate(session.ref, { mode: "graceful", graceMs: this.#deps.graceMs })
        .catch(() => undefined);
    }
    await Promise.race([session.exitSettled, delay(EXIT_WAIT_MS)]);
    // 脱离了进程组的后代（nohup、setsid 起的）：它们仍带着这个终端的标记，找出来逐个结束
    await this.#killStrays(session.marker);
    if (this.#sessions.get(project) === session) this.#sessions.delete(project);
  }

  async #killStrays(marker: string): Promise<void> {
    const strays = await this.#deps.proc
      .findByMarker({ name: TERMINAL_MARKER_ENV, value: marker })
      .catch(() => []);
    for (const stray of strays) {
      await this.#deps.proc.terminate(stray, { mode: "kill", graceMs: 0 }).catch(() => undefined);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
