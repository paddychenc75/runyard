import { isActiveState, type Run } from "@runyard/core";
import { type AbsPath, type Disposable, posixRelPath } from "@runyard/platform";
import type { Owner } from "@runyard/protocol";
import type { RunObserver } from "./run-module.ts";
import type { Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 命令行持有的运行空闲后自动停止（#42，规格 RUN-OWNERSHIP-09 到 17；PRD #prd-idle-stop；技术设计 §4.6）。
// 只针对 cli 持有的服务和页面：标签页持有的、脚本都不参与。下面四项任何一项把计时归零：
//  - 进程有输出（stdout、stderr）；
//  - 项目里的文件有变化；
//  - 有命令行的命令提到它（run、logs、status）；应用的请求不算，应用里查看它也不算；
//  - 端口上有已建立的连接，每 60 秒采样一次。
// 时长取设置 cliIdleStopMinutes，每次到点都现读；到点按正常流程停止，日志加 IDLE_STOPPED，run.exit 带 reason: 'idle'。
// 计时用一个到期的定时器，活动只更新“最后活动时间”：到点时发现还没满就按剩余时间再等，输出再密也不会反复重设定时器。

export const PORT_SAMPLE_MS = 60_000;
const WATCH_IGNORE = [".runyard", "node_modules", ".git"].map(posixRelPath);

export interface IdleStopDeps {
  readonly runOf: (runId: string) => Run | undefined;
  /** 项目文件夹，找不到就不监听文件变化 */
  readonly folderOf: (playgroundId: string) => Promise<AbsPath | undefined>;
}

export interface IdleStop {
  readonly observer: Required<Pick<RunObserver, "mentioned" | "state" | "log" | "exit">>;
  /** 命令行的一条命令提到了这个项目（logs.read 等不经 `RunObserver.mentioned` 的）；app 的请求忽略 */
  /** 填进快照的 `idleStopAt`：最后活动 + 空闲分钟；只有命令行持有、被盯着的运行有（#141，CLI-COMMANDS-51） */
  idleStopAt(runId: string, owner: Owner): number | undefined;
  mentionPlayground(playgroundId: string, session: Session | undefined): void;
  /** 管理进程关闭：停掉所有计时和监听 */
  dispose(): void;
}

interface Tracked {
  readonly runId: string;
  readonly playgroundId: string;
  last: number;
  /** 最近一次读到的 cliIdleStopMinutes（快照里的 idleStopAt 用，不另读设置） */
  minutes?: number;
  closed: boolean;
  timer?: number;
  sampler?: number;
  watcher?: Disposable;
}

const fromCli = (session: Session | undefined) => session?.info?.kind === "cli";

export function createIdleStop(api: SupervisorApi, deps: IdleStopDeps): IdleStop {
  const { platform, clock } = api;
  const tracked = new Map<string, Tracked>();

  const minutesNow = async () => (await api.readSettings()).cliIdleStopMinutes;

  function schedule(t: Tracked, minutes: number): void {
    t.minutes = minutes;
    if (t.timer !== undefined) clock.clearTimeout(t.timer);
    const wait = Math.max(0, t.last + minutes * 60_000 - clock.now());
    t.timer = clock.setTimeout(() => void expire(t), wait);
  }

  async function expire(t: Tracked): Promise<void> {
    t.timer = undefined;
    if (t.closed) return;
    const minutes = await minutesNow();
    if (t.closed) return;
    t.minutes = minutes;
    if (clock.now() < t.last + minutes * 60_000) return schedule(t, minutes);
    untrack(t);
    const run = deps.runOf(t.runId);
    // 持有者可能在这期间被“改为由我管理”，那就不再归我们停
    if (run === undefined || !isActiveState(run.state) || run.snapshot().owner.kind !== "cli")
      return;
    void run.stop({ idle: { minutes } });
  }

  async function sample(t: Tracked): Promise<void> {
    t.sampler = undefined;
    if (t.closed) return;
    const port = deps.runOf(t.runId)?.snapshot().port;
    if (port !== undefined) {
      const connections = await platform.ports.connections(port).catch(() => 0);
      if (connections > 0) t.last = clock.now();
    }
    if (!t.closed) t.sampler = clock.setTimeout(() => void sample(t), PORT_SAMPLE_MS);
  }

  async function watch(t: Tracked): Promise<void> {
    const folder = await deps.folderOf(t.playgroundId).catch(() => undefined);
    if (folder === undefined || t.closed) return;
    // 监听失败只是少一种活动信号，不影响其余三项
    const watcher = await platform
      .watch(folder, { ignore: WATCH_IGNORE }, () => {
        t.last = clock.now();
      })
      .catch(() => undefined);
    if (t.closed) await watcher?.dispose();
    else t.watcher = watcher;
  }

  function track(runId: string, playgroundId: string): void {
    const t: Tracked = { runId, playgroundId, last: clock.now(), closed: false };
    tracked.set(runId, t);
    void minutesNow().then((minutes) => {
      if (!t.closed) schedule(t, minutes);
    });
    t.sampler = clock.setTimeout(() => void sample(t), PORT_SAMPLE_MS);
    void watch(t);
  }

  function untrack(t: Tracked): void {
    t.closed = true;
    tracked.delete(t.runId);
    if (t.timer !== undefined) clock.clearTimeout(t.timer);
    if (t.sampler !== undefined) clock.clearTimeout(t.sampler);
    void t.watcher?.dispose();
  }

  const touch = (runId: string) => {
    const t = tracked.get(runId);
    if (t !== undefined) t.last = clock.now();
  };

  return {
    observer: {
      state: ({ run }) => {
        const existing = tracked.get(run.runId);
        const eligible =
          run.owner.kind === "cli" &&
          run.kind !== "oneshot" &&
          isActiveState(run.state) &&
          run.state !== "stopping";
        if (eligible && existing === undefined) track(run.runId, run.playgroundId);
        else if (!eligible && existing !== undefined) untrack(existing);
      },
      exit: ({ runId }) => {
        const existing = tracked.get(runId);
        if (existing !== undefined) untrack(existing);
      },
      log: (runId, entry) => {
        if (entry.kind === "stdout" || entry.kind === "stderr") touch(runId);
      },
      mentioned: (run, session) => {
        if (fromCli(session)) touch(run.runId);
      },
    },
    idleStopAt: (runId, owner) => {
      const t = tracked.get(runId);
      if (t === undefined || t.minutes === undefined || owner.kind !== "cli") return undefined;
      return t.last + t.minutes * 60_000;
    },
    mentionPlayground(playgroundId, session) {
      if (!fromCli(session)) return;
      for (const t of tracked.values()) if (t.playgroundId === playgroundId) t.last = clock.now();
    },
    dispose() {
      for (const t of [...tracked.values()]) untrack(t);
    },
  };
}
