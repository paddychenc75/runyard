import { join } from "node:path";
import { type AbsPath, absPath, isPlatformError, type Platform } from "@runyard/platform";

// 项目占多少磁盘（规格 LIBRARY-DISK-USAGE-01 到 12）：一层层读目录，不跟随符号链接，
// 按实际占用的块算，同一份数据的硬链接只算一次，不进入别的卷，读不了的目录跳过并记数。
// 依赖目录是任意层级名为 node_modules 或 .venv 的文件夹，里面的一切都算依赖，套着的依赖目录不重复数。
// 一次只读一个目录：大项目也是一串短小的异步读，不会长时间占着事件循环。

export const DEPENDENCY_DIR_NAMES: ReadonlySet<string> = new Set(["node_modules", ".venv"]);

export interface DiskUsageResult {
  /** 项目文件夹的总占用（含依赖目录和 .runyard） */
  readonly totalBytes: number;
  /** 其中依赖目录的占用 */
  readonly dependencyBytes: number;
  /** 找到的依赖目录的名字，去重、排好序 */
  readonly dependencyDirs: readonly string[];
  /** 没有权限读取、被跳过的文件夹个数；不为 0 就是“不完整” */
  readonly unreadable: number;
}

export interface DiskUsageOptions {
  /** 返回 true 就放弃（管理进程关闭）；放弃时结果是 null */
  readonly shouldStop?: () => boolean;
}

/** 找不到文件夹返回 "missing"；被要求放弃返回 "stopped" */
export async function computeDiskUsage(
  fs: Pick<Platform["fs"], "scanDir">,
  root: AbsPath,
  options: DiskUsageOptions = {},
): Promise<DiskUsageResult | "missing" | "stopped"> {
  const rootScan = await fs.scanDir(root).catch((error: unknown) => {
    if (isNoPermission(error)) return "denied" as const;
    throw error;
  });
  if (rootScan === null) return "missing";
  if (rootScan === "denied") {
    return { totalBytes: 0, dependencyBytes: 0, dependencyDirs: [], unreadable: 1 };
  }
  const device = rootScan.self.dev;
  const seen = new Set<string>();
  const depNames = new Set<string>();
  let total = rootScan.self.bytes;
  let dependency = 0;
  let unreadable = 0;
  const pending: { path: AbsPath; inDep: boolean; own: number }[] = [];

  const visit = (scan: NonNullable<typeof rootScan>, dir: AbsPath, inDep: boolean) => {
    for (const entry of scan.entries) {
      if (entry.kind === "dir") {
        if (entry.dev !== device) continue;
        const isDep = inDep || DEPENDENCY_DIR_NAMES.has(entry.name);
        if (isDep && !inDep) depNames.add(entry.name);
        total += entry.bytes;
        if (isDep) dependency += entry.bytes;
        pending.push({ path: absPath(join(dir, entry.name)), inDep: isDep, own: entry.bytes });
        continue;
      }
      if (entry.kind === "file" && entry.nlink > 1) {
        const key = `${entry.dev}:${entry.ino}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      total += entry.bytes;
      if (inDep) dependency += entry.bytes;
    }
  };

  visit(rootScan, root, false);
  while (pending.length > 0) {
    if (options.shouldStop?.() === true) return "stopped";
    const next = pending.pop() as (typeof pending)[number];
    let scan: Awaited<ReturnType<typeof fs.scanDir>>;
    try {
      scan = await fs.scanDir(next.path);
    } catch (error) {
      if (!isNoPermission(error)) throw error;
      unreadable += 1;
      continue;
    }
    if (scan === null) {
      // 读之前就被删了：它自己的块也不计
      total -= next.own;
      if (next.inDep) dependency -= next.own;
      continue;
    }
    visit(scan, next.path, next.inDep);
  }
  return {
    totalBytes: total,
    dependencyBytes: dependency,
    dependencyDirs: [...depNames].sort(),
    unreadable,
  };
}

function isNoPermission(error: unknown): boolean {
  return isPlatformError(error) && error.error.code === "PATH_LOCKED";
}
