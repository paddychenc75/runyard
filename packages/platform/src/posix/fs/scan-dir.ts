import type { Stats } from "node:fs";
import { lstat, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import type { DirScan, DiskEntry } from "../../platform.ts";
import { errnoOf, fsError } from "./map-fs-error.ts";

// 磁盘占用要的一层目录（platform.ts 的 fs.scanDir）。blocks 是 512 字节的块数，
// 与访达“占用磁盘”同一口径（APFS 克隆、稀疏文件按系统报的算）。
// 并发读子项的 lstat，上限防止一个有几万个文件的目录一次开太多。

const STAT_BATCH = 64;

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

export async function scanDirPosix(dir: AbsPath): Promise<DirScan | null> {
  let names: string[];
  let self: Stats;
  try {
    // 目录本身是链接时跟随它（项目文件夹可以是链进资源库的）；子项一律不跟随
    self = await stat(dir);
    if (!self.isDirectory()) return null;
    names = await readdir(dir);
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
        lstat(join(dir, name)).catch((error: unknown) => {
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
  return { self: toEntry(self), entries };
}
