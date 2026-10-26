import { relative, sep } from "node:path";
import { watch as chokidarWatch } from "chokidar";
import type { AbsPath } from "../../path-types.ts";
import { posixRelPath } from "../../path-types.ts";
import type { Disposable, Platform, WatchEvent, WatchOptions } from "../../platform.ts";

// 文件监听：chokidar 5（纯 JavaScript，技术设计 §6.4），darwin 与 linux 共用。
// 事件攒一小段时间再成批交给回调：保存一个文件常常连着几次系统事件，调用方只关心“有变化”。
// dispose 返回时底层句柄已关闭，之后不再有回调，调用方可以立刻改名或移走被监听的目录（规格对改名前先关监听的要求）。

const BATCH_MS = 30;
const HANDLE_CLOSE_GRACE_MS = 10;
// chokidar 报 ready 时 macOS 的事件流还没真正跑起来：负载高时，ready 之后立刻发生的变化会漏掉
//（实测：10 个空转进程的负载下，ready 后立刻写文件 80 次漏 1 次；等 20 毫秒起 80 次不漏）。
// 所以 watch() 多等一小会儿再返回，返回之后发生的变化就能看到
const STREAM_SETTLE_MS = 100;

function toKind(name: string): WatchEvent["kind"] | null {
  switch (name) {
    case "add":
    case "addDir":
      return "add";
    case "change":
      return "change";
    case "unlink":
    case "unlinkDir":
      return "remove";
    default:
      return null;
  }
}

function relOf(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export const watchPosix: Platform["watch"] = async (
  root: AbsPath,
  opts: WatchOptions,
  callback: (events: WatchEvent[]) => void,
): Promise<Disposable> => {
  const ignore = opts.ignore ?? [];
  const ignoreNames = new Set(opts.ignoreNames ?? []);
  const isIgnored = (path: string): boolean => {
    const rel = relOf(root, path);
    if (ignore.some((item) => rel === item || rel.startsWith(`${item}/`))) return true;
    // 在 chokidar 遍历前剪掉整个子树，不能等事件出来再过滤（嵌套依赖会占用大量监听句柄）。
    return (
      rel !== "" &&
      rel !== ".." &&
      !rel.startsWith("../") &&
      rel.split("/").some((part) => ignoreNames.has(part))
    );
  };
  const watcher = chokidarWatch(root, {
    ignoreInitial: true,
    ignored: isIgnored,
    persistent: true,
    ...(opts.depth === undefined ? {} : { depth: opts.depth - 1 }),
  });
  let pending: WatchEvent[] = [];
  let timer: NodeJS.Timeout | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    const batch = pending;
    pending = [];
    if (!disposed && batch.length > 0) callback(batch);
  };
  watcher.on("all", (name, path) => {
    const kind = toKind(name);
    const rel = relOf(root, path);
    if (disposed || kind === null || rel === "" || rel.startsWith("..")) return;
    const last = pending.at(-1);
    if (last?.kind === kind && last.path === rel) return;
    pending.push({ kind, path: posixRelPath(rel) });
    timer ??= setTimeout(flush, BATCH_MS);
  });
  // 监听出错（句柄用尽、目录消失）接口里没有出口，吞掉比让进程因未处理的 error 事件退出好；
  // 调用方靠资源库扫描兜底，事件不是唯一的真相来源
  watcher.on("error", () => undefined);
  await new Promise<void>((resolve) => watcher.once("ready", () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, STREAM_SETTLE_MS));

  return {
    async dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      pending = [];
      await watcher.close();
      // chokidar 的 close() 返回时 libuv 还没关完底层句柄（实测约 1.4 毫秒后才释放）；
      // 等一轮事件循环的定时器阶段，保证 dispose 返回时句柄真的交还了，调用方可以马上改名
      await new Promise((resolve) => setTimeout(resolve, HANDLE_CLOSE_GRACE_MS));
    },
  };
};
