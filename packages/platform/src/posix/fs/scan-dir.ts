import type { Stats } from "node:fs";
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
  stat(path: AbsPath): Promise<Stats>;
  lstat(path: AbsPath): Promise<Stats>;
  readdir(path: AbsPath): Promise<string[]>;
}

const diskIo: ScanDirIo = { stat, lstat, readdir };

function kindOf(info: Stats): DiskEntry["kind"] {
  if (info.isSymbolicLink()) return "symlink";
  if (info.isDirectory()) return "dir";
  if (info.isFile()) return "file";
  return "other";
}

function toEntry(info: Stats): DiskEntry {
  return {
    kind: kindOf(info),
    bytes: info.blocks * 512,
    dev: info.dev,
    ino: info.ino,
    nlink: info.nlink,
  };
}

export async function scanDirPosix(
  dir: AbsPath,
  expected?: Pick<DiskEntry, "dev" | "ino">,
  io: ScanDirIo = diskIo,
): Promise<DirScan | null> {
  let names: string[];
  let self: Stats;
  try {
    // 只有根项目允许链接；子目录必须仍是父扫描里看到的那一个，不能跟随后来替换的链接。
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
  for (let i = 0; i < names.length; i += STAT_BATCH) {
    const batch = names.slice(i, i + STAT_BATCH);
    const infos = await Promise.all(
      batch.map((name) =>
        io.lstat(absPath(join(dir, name))).catch((error: unknown) => {
          // 读到一半被删了：当它不在
          if (errnoOf(error) === "ENOENT") return null;
          throw fsError(error, join(dir, name), "scan");
        }),
      ),
    );
    batch.forEach((name, index) => {
      const info = infos[index];
      if (info !== null && info !== undefined) entries.push({ name, ...toEntry(info) });
    });
  }
  // 路径可能在 readdir/lstat 期间被替换；混合两份目录得出的数字不能覆盖缓存。
  const after = await (expected === undefined ? io.stat(dir) : io.lstat(dir)).catch(
    (error: unknown) => {
      const code = errnoOf(error);
      if (code === "ENOENT" || code === "ENOTDIR") return null;
      throw fsError(error, dir, "scan");
    },
  );
  if (after === null || !sameDirectory(after, self)) return changed(self);
  return { self: toEntry(self), entries };
}

function sameDirectory(info: Stats, expected: Pick<DiskEntry, "dev" | "ino">): boolean {
  return info.isDirectory() && info.dev === expected.dev && info.ino === expected.ino;
}

function changed(info: Stats): DirScan {
  return { self: toEntry(info), entries: [], changed: true };
}
