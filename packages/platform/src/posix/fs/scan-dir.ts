import type { BigIntStats } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type AbsPath, absPath } from "../../path-types.ts";
import type { DirScan, DiskEntry } from "../../platform.ts";
import { errnoOf, fsError } from "./map-fs-error.ts";

// 磁盘占用要的一层目录（platform.ts 的 fs.scanDir）。blocks 是 512 字节的块数，
// 与访达“占用磁盘”同一口径（APFS 克隆、稀疏文件按系统报的算）。
// 并发读子项的 lstat，上限防止一个有几万个文件的目录一次开太多。

const STAT_BATCH = 64;

interface ScanDirIo {
  stat(path: AbsPath): Promise<BigIntStats>;
  lstat(path: AbsPath): Promise<BigIntStats>;
  readdir(path: AbsPath): Promise<string[]>;
}

const diskIo: ScanDirIo = {
  stat: (path) => stat(path, { bigint: true }),
  lstat: (path) => lstat(path, { bigint: true }),
  readdir,
};

function kindOf(info: BigIntStats): DiskEntry["kind"] {
  if (info.isSymbolicLink()) return "symlink";
  if (info.isDirectory()) return "dir";
  if (info.isFile()) return "file";
  return "other";
}

function toEntry(info: BigIntStats): DiskEntry {
  return {
    kind: kindOf(info),
    bytes: Number(info.blocks) * 512,
    dev: Number(info.dev),
    ino: Number(info.ino),
    nlink: Number(info.nlink),
  };
}

export async function scanDirPosix(
  dir: AbsPath,
  expected?: Pick<DiskEntry, "dev" | "ino">,
  io: ScanDirIo = diskIo,
): Promise<DirScan | null> {
  let names: string[];
  let self: BigIntStats;
  let pathIdentity: BigIntStats;
  try {
    // 只有根项目允许链接；子目录必须仍是父扫描里看到的那一个，不能跟随后来替换的链接。
    pathIdentity = await io.lstat(dir);
    self = await (expected === undefined ? io.stat(dir) : io.lstat(dir));
    if (expected !== undefined && !sameDirectory(self, expected)) return changed(self);
    if (!self.isDirectory()) return null;
    names = await io.readdir(dir);
  } catch (error) {
    const code = errnoOf(error);
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw fsError(error, dir, "scan");
  }
  const entries: (DiskEntry & { name: string })[] = [];
  let unreadable = 0;
  for (let i = 0; i < names.length; i += STAT_BATCH) {
    const batch = names.slice(i, i + STAT_BATCH);
    const infos = await Promise.all(
      batch.map((name) =>
        io.lstat(absPath(join(dir, name))).catch((error: unknown) => {
          // 读到一半被删了：当它不在
          const code = errnoOf(error);
          if (code === "ENOENT") return null;
          if (code === "EACCES" || code === "EPERM") {
            unreadable += 1;
            return null;
          }
          throw fsError(error, join(dir, name), "scan");
        }),
      ),
    );
    batch.forEach((name, index) => {
      const info = infos[index];
      if (info !== null && info !== undefined) entries.push({ name, ...toEntry(info) });
    });
  }
  // 临时换成外链后又还原时 inode 不变，但 ctime 会变；保留纳秒精度才能拒绝这次混合结果。
  const after = await (expected === undefined ? io.stat(dir) : io.lstat(dir)).catch(
    (error: unknown) => {
      const code = errnoOf(error);
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw fsError(error, dir, "scan");
    },
  );
  const pathAfter = await io.lstat(dir).catch((error: unknown) => {
    if (errnoOf(error) === "ENOENT" || errnoOf(error) === "ENOTDIR") return null;
    throw fsError(error, dir, "scan");
  });
  if (
    after === null ||
    pathAfter === null ||
    !sameSnapshot(after, self) ||
    !sameIdentity(pathAfter, pathIdentity)
  )
    return changed(self);
  return { self: toEntry(self), entries, ...(unreadable ? { unreadable } : {}) };
}

function sameDirectory(info: BigIntStats, expected: Pick<DiskEntry, "dev" | "ino">): boolean {
  return (
    info.isDirectory() && Number(info.dev) === expected.dev && Number(info.ino) === expected.ino
  );
}

function sameSnapshot(info: BigIntStats, before: BigIntStats): boolean {
  return info.isDirectory() && sameIdentity(info, before);
}

function sameIdentity(info: BigIntStats, before: BigIntStats): boolean {
  return (
    info.dev === before.dev &&
    info.ino === before.ino &&
    info.ctimeNs === before.ctimeNs &&
    info.mtimeNs === before.mtimeNs
  );
}

function changed(info: BigIntStats): DirScan {
  return { self: toEntry(info), entries: [], changed: true };
}
