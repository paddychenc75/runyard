import { randomUUID } from "node:crypto";
import type { ProcRef } from "@runyard/platform";
import type { HostCommand, HostEvent } from "../../shared/pty-host-messages.ts";
import {
  SCROLLBACK_LINES,
  type TerminalEventName,
  type TerminalEvents,
  type TerminalForeground,
  type TerminalSize,
  type TerminalSnapshot,
  type TerminalState,
} from "../../shared/terminal.ts";
import { OutputBuffer } from "./output-buffer.ts";
import { PendingReplies } from "./pending-replies.ts";

// 主进程的终端服务（规格 desktop/terminal）：每个项目最多一个终端，第一次要才创建；
// 终端不显示时输出照常记下；关标签页、改名、移到废纸篓、退出应用时结束（连同里面启动的命令）。
// 真正的伪终端在 pty-host 进程里（它崩了不连累主进程和别的功能）；这里只管状态、缓冲和流控。
// 不认识 Electron：pty-host 通过 PtyHostLink 接进来，测试里换成假的。

/** 和 pty-host 的连接 */
export interface PtyHostLink {
  post(command: HostCommand): void;
  onEvent(listener: (event: HostEvent) => void): void;
  /** pty-host 进程退出了（崩溃、被杀，或我们让它退出） */
  onExit(listener: () => void): void;
  kill(): void;
}

/** 终端为什么被结束 */
export type ReleaseReason = "closed" | "renamed" | "trashed";

export interface TerminalServiceOptions {
  /** 起 pty-host 进程；第一次开终端才调用 */
  launch(): PtyHostLink;
  /** 项目文件夹；项目不存在或文件夹没了是 null */
  folderOf(project: string): string | null;
  /** 推给界面 */
  emit<E extends TerminalEventName>(event: E, payload: TerminalEvents[E]): void;
  /**
   * 后台进程意外结束或卡住时，主进程亲手收拾这个终端留下的一切：shell 所在的整个进程组（核对身份），
   * 加上所有带着这个终端标记的进程（脱离了进程组的后代）。平台层的 proc.terminate 与 proc.findByMarker
   */
  killTerminal(target: { ref: ProcRef | null; marker: string }): Promise<void>;
  /** 生成终端标记；测试里换成确定的 */
  newMarker?: () => string;
  /** 叠加到终端环境上的变量 */
  env?: Record<string, string>;
  /** 随应用安装的 runyard 启动脚本所在目录 */
  runyardBinDir?: string;
  scrollbackLines?: number;
  /** 等 pty-host 起好 shell 的上限（毫秒） */
  openTimeoutMs?: number;
  /** 结束一个终端、退出应用时等 pty-host 收尾的上限（毫秒），到点由主进程亲手收拾 */
  endTimeoutMs?: number;
}

const DEFAULT_OPEN_TIMEOUT_MS = 10_000;
const DEFAULT_END_TIMEOUT_MS = 4_000;

interface Entry {
  state: TerminalState;
  readonly buffer: OutputBuffer;
  /** 界面是否正在显示它（接上了） */
  attached: boolean;
  /** 已推给界面、界面还没回执的字符数 */
  pending: number;
  ref: ProcRef | null;
  /** 启动这个终端时给的标记，收拾残余进程要用 */
  marker: string;
  size: TerminalSize;
  /** 启动中：起好或失败时兑现 */
  starting: Promise<void> | null;
  settleStart: (() => void) | null;
  /** 正在结束 */
  ending: Promise<void> | null;
}

export class TerminalService {
  readonly #options: TerminalServiceOptions;
  readonly #entries = new Map<string, Entry>();
  #link: PtyHostLink | null = null;
  /** 结束终端的回话：true 是 pty-host 说收拾完了，后备值 false 是时限到了或 pty-host 没了 */
  readonly #closed = new PendingReplies<boolean>(false);
  readonly #foreground = new PendingReplies<string | null>(null);

  constructor(options: TerminalServiceOptions) {
    this.#options = options;
  }

  /** 第一次点“终端”：没有就创建，有就接上；返回现状和已记下的输出 */
  async open(project: string, size: TerminalSize): Promise<TerminalSnapshot> {
    let entry = this.#entries.get(project);
    if (entry === undefined || entry.state.kind === "none") {
      entry = this.#create(project, size);
      await this.#start(project, entry);
    } else if (entry.starting !== null) {
      await entry.starting;
    }
    return this.#attach(entry);
  }

  /** 只接上已有的终端，不创建 */
  async attach(project: string): Promise<TerminalSnapshot> {
    const entry = this.#entries.get(project);
    if (entry === undefined) return { state: { kind: "none" }, output: "" };
    if (entry.starting !== null) await entry.starting;
    return this.#attach(entry);
  }

  /** 界面不再显示：命令照常运行，输出照常记下；没回执的输出算已处理，别让 shell 因此停住 */
  detach(project: string): void {
    const entry = this.#entries.get(project);
    if (entry === undefined || !entry.attached) return;
    entry.attached = false;
    this.#release(project, entry);
  }

  write(project: string, data: string): void {
    if (this.#entries.get(project)?.state.kind === "running") {
      this.#link?.post({ type: "write", project, data });
    }
  }

  resize(project: string, size: TerminalSize): void {
    const entry = this.#entries.get(project);
    if (entry === undefined) return;
    entry.size = size;
    if (entry.state.kind === "running") {
      this.#link?.post({ type: "resize", project, cols: size.cols, rows: size.rows });
    }
  }

  /** 界面处理完了这么多字符的输出 */
  ack(project: string, length: number): void {
    const entry = this.#entries.get(project);
    if (entry === undefined || !Number.isInteger(length) || length <= 0) return;
    const acknowledged = Math.min(length, entry.pending);
    if (acknowledged === 0) return;
    entry.pending -= acknowledged;
    this.#link?.post({ type: "ack", project, length: acknowledged });
  }

  /** ⌘K：回滚内容清掉，shell 不受影响 */
  clear(project: string): void {
    this.#entries.get(project)?.buffer.clear();
  }

  /** 已结束的终端“重新打开”：在项目文件夹（改名后是新文件夹）里开新的，旧内容不留 */
  async reopen(project: string, size: TerminalSize): Promise<TerminalSnapshot> {
    const existing = this.#entries.get(project);
    if (existing !== undefined && existing.state.kind === "running") return this.#attach(existing);
    if (existing?.ending) await existing.ending;
    const entry = this.#create(project, size, existing?.attached ?? false);
    await this.#start(project, entry);
    return this.#attach(entry);
  }

  /** 终端里此刻在运行的命令；空闲或没有终端是 null */
  async foreground(project: string): Promise<TerminalForeground> {
    if (this.#entries.get(project)?.state.kind !== "running" || this.#link === null) {
      return { command: null };
    }
    const link = this.#link;
    const command = await this.#foreground.ask(2000, (id) =>
      link.post({ type: "foreground", project, id }),
    );
    return { command };
  }

  /** 所有终端里在运行命令的：⌘Q 的确认要列出来（规格 DESKTOP-TERMINAL-30） */
  async busyCommands(): Promise<{ project: string; command: string }[]> {
    const projects = [...this.#entries].filter(([, e]) => e.state.kind === "running");
    const found = await Promise.all(
      projects.map(async ([project]) => ({ project, ...(await this.foreground(project)) })),
    );
    return found.flatMap((f) =>
      f.command === null ? [] : [{ project: f.project, command: f.command }],
    );
  }

  /** 结束这个项目的终端和里面的全部命令；做完才返回（改名、移到废纸篓要等它放掉文件夹） */
  end(project: string, reason: ReleaseReason): Promise<void> {
    const entry = this.#entries.get(project);
    if (entry === undefined) return Promise.resolve();
    if (entry.ending !== null) return entry.ending;
    const ending = this.#end(project, entry, reason).finally(() => {
      entry.ending = null;
    });
    entry.ending = ending;
    return ending;
  }

  /** 退出应用：结束全部终端和 pty-host */
  async dispose(): Promise<void> {
    await Promise.all([...this.#entries.keys()].map((project) => this.end(project, "closed")));
    this.#link?.kill();
    this.#link = null;
  }

  /** 现在有终端在运行的项目 */
  runningProjects(): string[] {
    return [...this.#entries].filter(([, e]) => e.state.kind === "running").map(([id]) => id);
  }

  #create(project: string, size: TerminalSize, attached = false): Entry {
    const entry: Entry = {
      state: { kind: "none" },
      buffer: new OutputBuffer(this.#options.scrollbackLines ?? SCROLLBACK_LINES),
      attached,
      pending: 0,
      ref: null,
      marker: (this.#options.newMarker ?? randomUUID)(),
      size,
      starting: null,
      settleStart: null,
      ending: null,
    };
    this.#entries.set(project, entry);
    return entry;
  }

  async #start(project: string, entry: Entry): Promise<void> {
    const folder = this.#options.folderOf(project);
    if (folder === null) {
      this.#setState(project, entry, { kind: "ended", reason: "start-failed" });
      return;
    }
    const starting = new Promise<void>((resolve) => {
      entry.settleStart = resolve;
    });
    entry.starting = starting;
    const timer = setTimeout(
      () => this.#startFailed(project, entry),
      this.#options.openTimeoutMs ?? DEFAULT_OPEN_TIMEOUT_MS,
    );
    this.#ensureLink().post({
      type: "open",
      project,
      cwd: folder,
      cols: entry.size.cols,
      rows: entry.size.rows,
      env: this.#options.env ?? {},
      marker: entry.marker,
      ...(this.#options.runyardBinDir === undefined
        ? {}
        : { runyardBinDir: this.#options.runyardBinDir }),
    });
    await starting;
    clearTimeout(timer);
  }

  #startFailed(project: string, entry: Entry): void {
    if (entry.starting !== null) {
      this.#setState(project, entry, { kind: "ended", reason: "start-failed" });
      this.#finishStart(entry);
    }
  }

  #finishStart(entry: Entry): void {
    entry.starting = null;
    entry.settleStart?.();
    entry.settleStart = null;
  }

  #attach(entry: Entry): TerminalSnapshot {
    entry.attached = true;
    return { state: entry.state, output: entry.buffer.text() };
  }

  #setState(project: string, entry: Entry, state: TerminalState): void {
    entry.state = state;
    if (state.kind !== "running") entry.ref = null;
    this.#options.emit("terminal.state", { project, state });
  }

  /** 界面不会再回执的输出，当作已处理还给 pty-host */
  #release(project: string, entry: Entry): void {
    if (entry.pending === 0) return;
    const length = entry.pending;
    entry.pending = 0;
    this.#link?.post({ type: "ack", project, length });
  }

  #ensureLink(): PtyHostLink {
    if (this.#link !== null) return this.#link;
    const link = this.#options.launch();
    this.#link = link;
    link.onEvent((event) => this.#onEvent(event));
    link.onExit(() => {
      if (this.#link === link) this.#hostGone();
    });
    return link;
  }

  #onEvent(event: HostEvent): void {
    switch (event.type) {
      case "ready":
        return;
      case "closed":
        this.#closed.reply(event.id, true);
        return;
      case "foreground":
        this.#foreground.reply(event.id, event.command);
        return;
    }
    const entry = this.#entries.get(event.project);
    if (entry === undefined) return;
    switch (event.type) {
      case "data":
        entry.buffer.append(event.data);
        if (entry.attached) {
          entry.pending += event.data.length;
          this.#options.emit("terminal.data", { project: event.project, data: event.data });
        } else {
          // 没人看：输出记下就算处理完，别让 shell 因为没人回执而停住（命令要继续运行）
          this.#link?.post({ type: "ack", project: event.project, length: event.data.length });
        }
        return;
      case "started":
        entry.ref =
          event.startTime === null ? null : { pid: event.pid, startTime: event.startTime };
        this.#setState(event.project, entry, {
          kind: "running",
          pid: event.pid,
          shell: event.shell,
          ...(event.notice === undefined ? {} : { notice: event.notice }),
        });
        this.#finishStart(entry);
        return;
      case "start-failed":
        this.#setState(event.project, entry, { kind: "ended", reason: "start-failed" });
        this.#finishStart(entry);
        return;
      case "exit":
        // 我们自己让它结束的（end）由 end 收尾；这里只管 shell 自己退出
        if (event.requested || entry.ending !== null) return;
        this.#setState(event.project, entry, {
          kind: "ended",
          reason: "exited",
          exitCode: event.exitCode,
        });
        return;
    }
  }

  async #end(project: string, entry: Entry, reason: ReleaseReason): Promise<void> {
    // 改名在应用里先结束过一次，管理进程随后又请求释放：已经是“项目已改名”就不再重复
    if (reason === "renamed" && entry.state.kind === "ended" && entry.state.reason === "renamed") {
      return;
    }
    if (entry.starting !== null) await entry.starting;
    const link = this.#link;
    if (entry.state.kind === "running" && link !== null) {
      const closed = await this.#closed.ask(
        this.#options.endTimeoutMs ?? DEFAULT_END_TIMEOUT_MS,
        (id) => link.post({ type: "end", project, id }),
      );
      // pty-host 没在时限内收尾（卡住了）：主进程亲手收拾这个终端留下的一切
      if (!closed && this.#link === link) {
        await this.#options
          .killTerminal({ ref: entry.ref, marker: entry.marker })
          .catch(() => undefined);
      }
    }
    if (reason === "renamed" && entry.state.kind !== "none") {
      this.#setState(project, entry, { kind: "ended", reason: "renamed" });
      return;
    }
    this.#entries.delete(project);
  }

  /** pty-host 进程没了：所有在运行的终端都算意外结束，并收拾它们留下的 shell 和命令 */
  #hostGone(): void {
    this.#link = null;
    this.#foreground.settleAll();
    this.#closed.settleAll();
    for (const [project, entry] of this.#entries) {
      const ref = entry.ref;
      const wasRunning = entry.state.kind === "running" || entry.starting !== null;
      if (wasRunning) {
        this.#setState(project, entry, { kind: "ended", reason: "host-crashed" });
        this.#finishStart(entry);
      }
      entry.pending = 0;
      if (wasRunning) {
        void this.#options.killTerminal({ ref, marker: entry.marker }).catch(() => undefined);
      }
    }
  }
}
