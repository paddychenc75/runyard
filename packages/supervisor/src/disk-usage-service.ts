import { computeDiskUsage } from "@runyard/core";
import { type AbsPath, type Disposable, isPlatformError, posixRelPath } from "@runyard/platform";
import type { PlaygroundSize } from "@runyard/protocol";
import type { SupervisorApi } from "./supervisor-api.ts";

// 项目的磁盘占用（规格 LIBRARY-DISK-USAGE-03 到 20）：后台一次算一个项目，结果只放在内存里。
// 触发：新出现的项目（启动、新建、副本、重新定位、认回）、项目里的文件变化（5 秒没有新变化才算，
// 持续变化最迟 60 秒）、依赖安装或运行结束（经 `refresh`）、每 30 分钟全部复核。
// 算的时候不挡别的请求：遍历是一串异步读，队列自己在后台跑，调用方只读缓存。

export const SIZE_QUIET_MS = 5000;
export const SIZE_MAX_WAIT_MS = 60_000;
export const SIZE_SWEEP_MS = 30 * 60_000;

// 依赖目录里的变化不监听（体量大、变化多）；.runyard 里是运行日志，运行结束时会重算
const WATCH_IGNORE = [posixRelPath(".runyard")];
const WATCH_IGNORE_NAMES = ["node_modules", ".venv"];

export interface SizedFolder {
  readonly id: string;
  readonly path: AbsPath;
  readonly missing: boolean;
}

export interface DiskUsageService {
  /** 缓存里的结果；没有（还在算、找不到文件夹、已移除）是 undefined */
  get(id: string): PlaygroundSize | undefined;
  /**
   * 资源库变了（启动、新建、改名、移除、重新扫描……）：按现在的项目表对账。
   * 新出现的项目排队计算；路径变了（改名）的保留结果并换监听；不在表里的清掉结果和监听；
   * `root` 是资源库根目录，读不了时本轮不报告新结果
   */
  sync(root: AbsPath, folders: readonly SizedFolder[]): void;
  /** 这个项目的内容可能变了（重新定位、依赖安装结束、运行结束）：马上排队重算，期间仍报旧结果 */
  refresh(id: string): void;
  /** 移动目录前等待自身监听释放；缓存保留，下次 sync 恢复监听 */
  pause(id: string): Promise<void>;
  /** 此刻有没有排队或正在算的任务（测试等“算完”用） */
  idle(): Promise<void>;
  dispose(): Promise<void>;
}

interface Tracked {
  path: AbsPath;
  paused: boolean;
  generation: number;
  size: PlaygroundSize | undefined;
  /** 监听的建立（含失败后的 undefined）；换路径、移除、关闭时先等它再释放 */
  watching: Promise<Disposable | undefined>;
  /** 防抖：第一次变化的时刻和到点的定时器 */
  firstChange: number | undefined;
  timer: number | undefined;
}

export function createDiskUsageService(
  api: Pick<SupervisorApi, "platform" | "clock">,
  hooks: { onChange(id: string): void; log(line: string): void },
): DiskUsageService {
  const { platform, clock } = api;
  const tracked = new Map<string, Tracked>();
  const queue: string[] = [];
  const releasing = new Set<Promise<void>>();
  const releaseErrors: unknown[] = [];
  const failedReleases = new Set<Tracked>();
  let root: AbsPath | undefined;
  let running = false;
  let current: Promise<void> = Promise.resolve();
  let disposed = false;
  let sweepTimer: number | undefined;
  // 正在算的项目在途中又被要求重算：算完马上再来一遍
  let rerun = false;
  let computing: string | undefined;

  function enqueue(id: string): void {
    if (disposed || !tracked.has(id) || tracked.get(id)?.paused) return;
    if (id === computing) {
      rerun = true;
      return;
    }
    if (!queue.includes(id)) queue.push(id);
    if (!running) current = drain();
  }

  async function drain(): Promise<void> {
    running = true;
    try {
      while (queue.length > 0 && !disposed) {
        const id = queue.shift() as string;
        const entry = tracked.get(id);
        if (entry === undefined || entry.paused) continue;
        computing = id;
        rerun = false;
        try {
          await compute(id, entry);
        } catch (error) {
          hooks.log(`disk usage failed for ${entry.path}: ${String(error)}`);
        }
        computing = undefined;
        if (rerun && tracked.has(id)) queue.push(id);
      }
    } finally {
      running = false;
    }
  }

  async function rootReadable(): Promise<boolean> {
    if (root === undefined) return true;
    try {
      const scan = await platform.fs.scanDir(root);
      return scan !== null && !scan.changed;
    } catch (error) {
      if (isPlatformError(error) && error.error.code === "PATH_LOCKED") return false;
      throw error;
    }
  }

  async function compute(id: string, entry: Tracked): Promise<void> {
    const { path, generation } = entry;
    // 资源库根目录读不了：不报告任何新结果，旧的保留
    if (!(await rootReadable())) return;
    const result = await computeDiskUsage(platform.fs, path, { shouldStop: () => disposed });
    if (
      result === "stopped" ||
      disposed ||
      tracked.get(id) !== entry ||
      entry.generation !== generation
    )
      return;
    if (result === "changed") {
      touch(id);
      return;
    }
    // 遍历期间根目录可能失去权限；这次异步检查也可能遇到改名或移除，接纳前再核对一次。
    if (
      !(await rootReadable()) ||
      disposed ||
      tracked.get(id) !== entry ||
      entry.generation !== generation
    )
      return;
    const next: PlaygroundSize | undefined =
      result === "missing"
        ? undefined
        : {
            totalBytes: result.totalBytes,
            dependencyBytes: result.dependencyBytes,
            dependencyDirs: [...result.dependencyDirs],
            unreadable: result.unreadable,
          };
    if (sameSize(entry.size, next)) return;
    entry.size = next;
    hooks.onChange(id);
  }

  // 变化：最后一次变化之后 SIZE_QUIET_MS 没有新的就算；持续变化时最迟第一次变化之后 SIZE_MAX_WAIT_MS
  function touch(id: string): void {
    const entry = tracked.get(id);
    if (entry === undefined || entry.paused || disposed) return;
    const now = clock.now();
    entry.firstChange ??= now;
    const due = Math.min(now + SIZE_QUIET_MS, entry.firstChange + SIZE_MAX_WAIT_MS);
    if (entry.timer !== undefined) clock.clearTimeout(entry.timer);
    entry.timer = clock.setTimeout(
      () => {
        entry.timer = undefined;
        entry.firstChange = undefined;
        enqueue(id);
      },
      Math.max(0, due - now),
    );
  }

  function startWatch(id: string, entry: Tracked): Promise<Disposable | undefined> {
    return platform
      .watch(entry.path, { ignore: WATCH_IGNORE, ignoreNames: WATCH_IGNORE_NAMES }, (events) => {
        if (events.length > 0) touch(id);
      })
      .catch((error: unknown) => {
        hooks.log(`watching ${entry.path} failed: ${String(error)}`);
        return undefined;
      });
  }

  function clearTimer(entry: Tracked): void {
    if (entry.timer !== undefined) clock.clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.firstChange = undefined;
  }

  function stopWatch(entry: Tracked): Promise<void> {
    clearTimer(entry);
    const previous = entry.watching;
    const stopped = previous.then(async (watcher) => {
      await watcher?.dispose();
      failedReleases.delete(entry);
    });
    entry.watching = stopped.then(
      () => undefined,
      () => previous,
    );
    // 立即挂拒绝处理；removed 项不再在 tracked 中，退出仍必须等它交还句柄。
    const settled = stopped.catch((error: unknown) => {
      releaseErrors.push(error);
      failedReleases.add(entry);
      hooks.log(`closing disk watcher failed: ${String(error)}`);
    });
    releasing.add(settled);
    void settled.then(() => releasing.delete(settled));
    return stopped;
  }

  function sweep(): void {
    sweepTimer = clock.setTimeout(() => {
      for (const id of tracked.keys()) enqueue(id);
      sweep();
    }, SIZE_SWEEP_MS);
  }

  return {
    get: (id) => tracked.get(id)?.size,
    sync(libraryRoot, folders) {
      if (disposed) return;
      root = libraryRoot;
      if (sweepTimer === undefined) sweep();
      const wanted = new Map(folders.filter((f) => !f.missing).map((f) => [f.id, f]));
      for (const [id, entry] of tracked) {
        if (wanted.has(id)) continue;
        // 找不到文件夹的项目没有大小，客户端靠 missingSince 知道；移除的项目由调用方发 removed
        tracked.delete(id);
        void stopWatch(entry).catch(() => {});
      }
      for (const [id, folder] of wanted) {
        const known = tracked.get(id);
        if (known === undefined) {
          const entry: Tracked = {
            path: folder.path,
            paused: false,
            generation: 0,
            size: undefined,
            watching: Promise.resolve(undefined),
            firstChange: undefined,
            timer: undefined,
          };
          tracked.set(id, entry);
          entry.watching = startWatch(id, entry);
          enqueue(id);
        } else if (known.path !== folder.path || known.paused) {
          // 改名：结果保留（规格 -18），监听换到新路径
          known.path = folder.path;
          known.paused = false;
          known.generation += 1;
          const previous = known.watching;
          clearTimer(known);
          known.watching = previous.then(async (watcher) => {
            try {
              await watcher?.dispose();
            } catch (error) {
              known.paused = true;
              hooks.log(`replacing disk watcher failed: ${String(error)}`);
              return watcher;
            }
            return disposed || tracked.get(id) !== known ? undefined : startWatch(id, known);
          });
          // 旧路径的重算可能正在进行：不接纳它的结果，新路径另算，已有缓存始终保留。
          enqueue(id);
        }
      }
    },
    async pause(id) {
      const entry = tracked.get(id);
      if (!entry) return;
      entry.paused = true;
      entry.generation += 1;
      await stopWatch(entry);
    },
    refresh(id) {
      const entry = tracked.get(id);
      if (entry === undefined) return;
      clearTimer(entry);
      enqueue(id);
    },
    async idle() {
      // 排队的任务一个接一个；循环等到队列真的空了
      while (running || queue.length > 0) await current;
    },
    async dispose() {
      disposed = true;
      if (sweepTimer !== undefined) clock.clearTimeout(sweepTimer);
      queue.length = 0;
      const entries = new Set([...tracked.values(), ...failedReleases]);
      tracked.clear();
      for (const entry of entries) void stopWatch(entry).catch(() => {});
      await Promise.all(releasing);
      if (releaseErrors.length)
        throw new AggregateError(releaseErrors, "disk watcher release failed");
    },
  };
}

function sameSize(a: PlaygroundSize | undefined, b: PlaygroundSize | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.totalBytes === b.totalBytes &&
    a.dependencyBytes === b.dependencyBytes &&
    a.unreadable === b.unreadable &&
    a.dependencyDirs.join("\n") === b.dependencyDirs.join("\n")
  );
}
