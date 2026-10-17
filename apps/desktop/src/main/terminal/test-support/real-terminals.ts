import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getPlatform, type Platform } from "@runyard/platform";
import { type HostDeps, PtyHost } from "../../../pty-host/host.ts";
import { createHostDeps } from "../../../pty-host/run.ts";
import {
  type HostCommand,
  type HostEvent,
  parseHostCommand,
} from "../../../shared/pty-host-messages.ts";
import type { TerminalSize, TerminalSnapshot } from "../../../shared/terminal.ts";
import { killTerminal } from "../kill-terminal.ts";
import { type PtyHostLink, TerminalService } from "../terminal-service.ts";
import { OutputCollector } from "../terminal-smoke.ts";

// 真伪终端的测试装配：主进程的终端服务 + 真的 pty-host 核心 + 真的 node-pty 和 zsh，
// 只是 pty-host 与服务在同一个进程里（消息照样经过 JSON 序列化，和 utilityProcess 的结构化克隆一样）。
// 临时目录里放项目文件夹和一个干净的 HOME（带一个只设提示符的 .zshrc），绝不碰真实的主目录。

const SPAWNED_KEY = Symbol.for("runyard.test.spawned-processes");

/** 登记给进程测试阶段的遗留进程守卫（协议见 tooling/vitest/spawned-registry.ts）：测试文件结束时还活着就结束并让文件失败 */
function registerSpawned(platform: Platform, pid: number, startTime: number): void {
  const holder = globalThis as unknown as Record<
    symbol,
    Set<{ pid: number; alive(): Promise<boolean>; kill(): void }> | undefined
  >;
  const registry = holder[SPAWNED_KEY] ?? new Set();
  holder[SPAWNED_KEY] = registry;
  registry.add({
    pid,
    alive: async () => (await platform.proc.identity(pid))?.startTime === startTime,
    kill: () => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        // 刚好没了
      }
    },
  });
}

class LoopbackLink implements PtyHostLink {
  readonly host: PtyHost;
  readonly #events: ((event: HostEvent) => void)[] = [];
  readonly #exits: (() => void)[] = [];

  constructor(overrides: Partial<HostDeps>, platform: Platform) {
    this.host = new PtyHost(
      createHostDeps((event) => {
        const copy = JSON.parse(JSON.stringify(event)) as HostEvent;
        if (copy.type === "started" && copy.startTime !== null) {
          registerSpawned(platform, copy.pid, copy.startTime);
        }
        queueMicrotask(() => {
          for (const listener of this.#events) listener(copy);
        });
      }, overrides),
    );
  }

  post(command: HostCommand): void {
    const parsed = parseHostCommand(JSON.parse(JSON.stringify(command)));
    if (parsed !== null) this.host.handle(parsed);
  }
  onEvent(listener: (event: HostEvent) => void): void {
    this.#events.push(listener);
  }
  onExit(listener: () => void): void {
    this.#exits.push(listener);
  }
  kill(): void {
    void this.host.dispose();
  }
  /** 模拟 pty-host 进程意外死亡：这里只能通知服务，真正留下的 shell 由服务按进程身份收拾 */
  crash(): void {
    for (const listener of this.#exits) listener();
  }
}

export interface RealTerminalsOptions {
  /** 项目名到文件夹名（建在临时根目录下）；缺省 demo 和 api */
  projects?: string[];
  /** 写进 HOME/.zshrc 的内容，缺省只设提示符 */
  zshrc?: string;
  /** 随应用安装的 runyard 启动脚本目录（相对临时根目录建出来的）里的文件：名字到内容 */
  binDir?: Record<string, string>;
  overrides?: Partial<HostDeps>;
  /** 叠加到终端环境上的变量 */
  env?: Record<string, string>;
}

export interface RealTerminals {
  service: TerminalService;
  platform: Platform;
  link: LoopbackLink;
  /** 各个终端的标记，按创建顺序（第 n 个终端的标记是 markers[n]，从 0 起） */
  markers: string[];
  /** 临时根目录（真实路径） */
  root: string;
  home: string;
  folders: Record<string, string>;
  /** 每个项目收到的输出（推给界面的那一路，加上 open、reopen 返回的已有输出） */
  output(project: string): OutputCollector;
  /** 像界面一样打开终端：返回的已有输出也算收到的 */
  open(project: string, size: TerminalSize): Promise<TerminalSnapshot>;
  reopen(project: string, size: TerminalSize): Promise<TerminalSnapshot>;
  binDir: string | undefined;
}

export function realTerminals(options: RealTerminalsOptions = {}): RealTerminals {
  const platform = getPlatform();
  const root = realpathSync(mkdtempSync(join(tmpdir(), "ry-term-")));
  const home = join(root, "home");
  mkdirSync(home);
  writeFileSync(join(home, ".zshrc"), options.zshrc ?? "PROMPT='READY> '\nbindkey -e\n");
  const folders: Record<string, string> = {};
  for (const name of options.projects ?? ["demo", "api"]) {
    folders[name] = join(root, name);
    mkdirSync(folders[name]);
  }
  let binDir: string | undefined;
  if (options.binDir !== undefined) {
    binDir = join(root, "bin");
    mkdirSync(binDir);
    for (const [name, content] of Object.entries(options.binDir)) {
      writeFileSync(join(binDir, name), content, { mode: 0o755 });
    }
  }
  const collectors = new Map<string, OutputCollector>();
  const collector = (project: string): OutputCollector => {
    let found = collectors.get(project);
    if (found === undefined) {
      found = new OutputCollector();
      collectors.set(project, found);
    }
    return found;
  };
  const markers: string[] = [];
  // 测试要的是确定的 shell：规格场景的前提是“用户的登录 shell 是 /bin/zsh”，而 CI 机器上的用户记录里是 /bin/bash。
  // 真的“取自用户记录”那条路由打包后的冒烟和 terminal-process 的测试走
  const link = new LoopbackLink(
    { earlyExitMs: 400, graceMs: 800, loginShell: async () => "/bin/zsh", ...options.overrides },
    platform,
  );
  const service = new TerminalService({
    launch: () => link,
    folderOf: (id) => folders[id] ?? null,
    emit: (event, payload) => {
      if (event === "terminal.data") {
        const data = payload as { project: string; data: string };
        collector(data.project).push(data);
        // 界面处理完了就回执，和真的界面一样
        service.ack(data.project, data.data.length);
      }
    },
    killTerminal: (target) => killTerminal(platform, target),
    newMarker: () => {
      const marker = `test-${process.pid}-${markers.length}-${Math.random().toString(36).slice(2)}`;
      markers.push(marker);
      return marker;
    },
    env: { HOME: home, ...options.env },
    ...(binDir === undefined ? {} : { runyardBinDir: binDir }),
    endTimeoutMs: 6000,
  });
  const received = (project: string, snapshot: TerminalSnapshot): TerminalSnapshot => {
    if (snapshot.output !== "") collector(project).push({ project, data: snapshot.output });
    return snapshot;
  };
  return {
    service,
    platform,
    link,
    root,
    home,
    folders,
    output: collector,
    markers,
    binDir,
    open: async (project, size) => received(project, await service.open(project, size)),
    reopen: async (project, size) => received(project, await service.reopen(project, size)),
  };
}

/** 等进程消失（按 pid 加启动时间认身份），最多等 limitMs；返回等了多久，没等到是 null */
export async function waitGone(
  platform: Platform,
  pid: number,
  limitMs: number,
): Promise<number | null> {
  const began = Date.now();
  while (Date.now() - began < limitMs) {
    if ((await platform.proc.identity(pid)) === null) return Date.now() - began;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return (await platform.proc.identity(pid)) === null ? Date.now() - began : null;
}

/** 删掉测试自己建的临时根目录 */
export function removeRoot(root: string): void {
  // delete-allow: 测试自己建的临时目录（项目文件夹、HOME、脚本），不是用户的内容
  rmSync(root, { recursive: true, force: true });
}
