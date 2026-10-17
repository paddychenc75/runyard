import { isActiveState, type Run, type RunStateEvent, type ScriptRuns } from "@runyard/core";
import { type AbsPath, type Disposable, posixRelPath } from "@runyard/platform";
import type { RunObserver } from "./run-module.ts";
import type { Session } from "./session.ts";
import type { SupervisorApi } from "./supervisor-api.ts";

// 脚本项目“保存后自动重新运行”的文件监听何时开始、何时结束（#138，规格 RUN-SCRIPTS-27 到 34）。
// core 的 `ScriptRuns.watch` 只管“有变化就重跑”，这里决定它什么时候挂上、什么时候摘掉：
//  - 开始：命令行持有的脚本运行出现（`runyard run`），且项目开关和全局设置都没关；没运行过的项目不监听。
//  - 结束：`runyard stop`（`end`）、项目被移到废纸篓（`end`，经 RunsView.stop）、管理进程关闭（`dispose`）、
//    或者命令行持有的监听空闲满 `cliIdleStopMinutes`。
// 空闲的口径与命令行运行的空闲停止（idle-stop.ts）相同：项目文件夹里的文件变化、命令行的命令提到它；
// 但脚本不参与运行的空闲停止（RUN-OWNERSHIP-16），空闲结束的只是监听，不会停任何运行。
// 重跑时旧的先停、新的再起，由 `ScriptRuns` 保证；重跑出来的运行沿用同一个持有者，所以不会重复监听。
// 桌面应用的标签页持有的运行（脚本和服务）也在这里监听（RUN-SCRIPTS-32、TEMPLATES-RUNNERS-36，#262）：
// 保存与外部写入一样由磁盘变化驱动。监听跟随标签页：`run.stop`（关标签页、停止按钮）、应用断开或告别时结束，
// 没有空闲计时；运行器 `watch.mode` 为 none（静态页面、Vite 热更新）时 `ScriptRuns.watch` 什么也不挂。
// 服务（restart）只受运行器的规则管，不受脚本的“保存后自动运行”开关管。

const ACTIVITY_IGNORE = [".runyard", "node_modules", ".git"].map(posixRelPath);

export interface ScriptWatchDeps {
  readonly scripts: Pick<ScriptRuns, "watch">;
  readonly runOf: (runId: string) => Run | undefined;
  /** 全局 `scriptAutoRun` 与项目 `script.autoRun` 都没关 */
  readonly autoRunEnabled: (playgroundId: string) => Promise<boolean>;
  /** 项目文件夹，找不到就不监听文件变化 */
  readonly folderOf: (playgroundId: string) => Promise<AbsPath | undefined>;
}

export interface ScriptWatch {
  readonly observer: Required<Pick<RunObserver, "state">>;
  /** 命令行的命令提到了这个项目；应用的请求不算活动 */
  mention(playgroundId: string, session: Session | undefined): void;
  /** 结束这个项目的监听（`runyard stop`、移到废纸篓）；没在监听时什么也不做 */
  end(playgroundId: string): void;
  /** 应用的这个客户端断开或告别：结束它的标签页持有的全部监听 */
  endTabsOf(clientId: string): void;
  /** 结束全部监听（`runyard stop --all`） */
  endAll(): void;
  /** 管理进程关闭：摘掉全部监听和计时 */
  dispose(): void;
  /** 此刻是否在监听（测试和诊断用） */
  isWatching(playgroundId: string): boolean;
}

interface Watching {
  readonly playgroundId: string;
  /** 标签页持有的监听不计空闲，也不需要活动信号 */
  readonly tabClientId: string | undefined;
  last: number;
  closed: boolean;
  timer?: number;
  watcher?: Disposable;
  activity?: Disposable;
}

export function createScriptWatch(api: SupervisorApi, deps: ScriptWatchDeps): ScriptWatch {
  const { platform, clock } = api;
  const watching = new Map<string, Watching>();

  const minutesNow = async () => (await api.readSettings()).cliIdleStopMinutes;

  function schedule(w: Watching, minutes: number): void {
    if (w.timer !== undefined) clock.clearTimeout(w.timer);
    const wait = Math.max(0, w.last + minutes * 60_000 - clock.now());
    w.timer = clock.setTimeout(() => void expire(w), wait);
  }

  async function expire(w: Watching): Promise<void> {
    w.timer = undefined;
    if (w.closed) return;
    const minutes = await minutesNow();
    if (w.closed) return;
    // 设置每次到点现读：期间有活动或设置调大了，就按剩余时间再等
    if (clock.now() < w.last + minutes * 60_000) return schedule(w, minutes);
    close(w);
  }

  function close(w: Watching): void {
    if (w.closed) return;
    w.closed = true;
    if (watching.get(w.playgroundId) === w) watching.delete(w.playgroundId);
    if (w.timer !== undefined) clock.clearTimeout(w.timer);
    w.timer = undefined;
    void w.watcher?.dispose();
    void w.activity?.dispose();
  }

  async function begin(run: Run): Promise<void> {
    const { playgroundId, owner } = run.request;
    // 同步占位：状态事件一个接一个来，不能让两次都走到 watch
    const w: Watching = {
      playgroundId,
      tabClientId: owner.kind === "tab" ? owner.clientId : undefined,
      last: clock.now(),
      closed: false,
    };
    watching.set(playgroundId, w);
    try {
      // 开关只管脚本；服务的重启由运行器的规则决定
      if (run.request.kind === "oneshot" && !(await deps.autoRunEnabled(playgroundId))) {
        return close(w);
      }
      if (w.closed) return;
      const watcher = await deps.scripts.watch(run.request);
      if (w.closed) return void (await watcher.dispose());
      w.watcher = watcher;
      if (w.tabClientId !== undefined) return;
      const folder = await deps.folderOf(playgroundId).catch(() => undefined);
      if (folder !== undefined && !w.closed) {
        // 活动信号监听失败只是少一种信号，监听本身照常
        const activity = await platform
          .watch(folder, { ignore: ACTIVITY_IGNORE }, () => {
            w.last = clock.now();
          })
          .catch(() => undefined);
        if (w.closed) await activity?.dispose();
        else w.activity = activity;
      }
      if (w.closed) return;
      const minutes = await minutesNow();
      if (!w.closed) schedule(w, minutes);
    } catch {
      // 读设置、挂监听出错：这个项目就不监听，运行本身不受影响
      close(w);
    }
  }

  return {
    observer: {
      state: ({ run: snapshot }: RunStateEvent) => {
        const tabOwned = snapshot.owner.kind === "tab";
        if (!tabOwned && !(snapshot.owner.kind === "cli" && snapshot.kind === "oneshot")) return;
        if (watching.has(snapshot.playgroundId)) return;
        // 正在停止的运行不开始监听：`runyard stop` 先摘掉监听，随后这次运行自己的“停止中”事件不能把它重新挂上（#153）
        if (!isActiveState(snapshot.state) || snapshot.state === "stopping") return;
        const run = deps.runOf(snapshot.runId);
        if (run !== undefined) void begin(run);
      },
    },
    mention(playgroundId, session) {
      if (session?.info?.kind !== "cli") return;
      const w = watching.get(playgroundId);
      if (w !== undefined) w.last = clock.now();
    },
    end(playgroundId) {
      const w = watching.get(playgroundId);
      if (w !== undefined) close(w);
    },
    endTabsOf(clientId) {
      for (const w of [...watching.values()]) if (w.tabClientId === clientId) close(w);
    },
    endAll() {
      for (const w of [...watching.values()]) close(w);
    },
    dispose() {
      for (const w of [...watching.values()]) close(w);
    },
    isWatching: (playgroundId) => watching.has(playgroundId),
  };
}
