import { chmod, lstat, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { errnoOf } from "../../posix/fs/map-fs-error.ts";

// 条目所在卷的废纸篓目录（决策记录 0010 第 1 条）：
// 和主目录同一个卷用 ~/.Trash；别的卷用 <卷的挂载点>/.Trashes/<uid>（.Trashes 模式 1333，<uid> 模式 0700，实测）。
// 卷上建不出来（只读卷、没有写权限）返回 null，由调用方走“复制再删”的兜底。
// 注意：不列目录——macOS 的隐私保护让 ~/.Trash 的列目录返回 EPERM（K9 实测）。

async function ensureDir(path: string, mode: number): Promise<"created" | "existed"> {
  try {
    await mkdir(path, { mode });
    return "created";
  } catch (error) {
    if (errnoOf(error) === "EEXIST") return "existed";
    throw error;
  }
}

/** 往上找，直到上一级不在同一个卷：最后一个在同一个卷里的目录就是挂载点 */
export async function mountPointOf(path: string, dev: number): Promise<string> {
  let current = path;
  for (;;) {
    const parent = dirname(current);
    if (parent === current) return current;
    const info = await lstat(parent);
    if (info.dev !== dev) return current;
    current = parent;
  }
}

export async function homeTrashDir(home: string): Promise<string> {
  const trash = join(home, ".Trash");
  await ensureDir(trash, 0o700);
  return trash;
}

/** 卷上的废纸篓目录；没有可用的返回 null */
export async function volumeTrashDir(
  home: string,
  uid: number,
  item: string,
  itemDev: number,
): Promise<string | null> {
  const homeTrash = await homeTrashDir(home);
  if ((await lstat(homeTrash)).dev === itemDev) return homeTrash;
  const mount = await mountPointOf(dirname(item), itemDev);
  try {
    const trashes = join(mount, ".Trashes");
    if ((await ensureDir(trashes, 0o700)) === "created") await chmod(trashes, 0o1333);
    const own = join(trashes, String(uid));
    await ensureDir(own, 0o700);
    return own;
  } catch (error) {
    const code = errnoOf(error);
    if (
      code === "EACCES" ||
      code === "EPERM" ||
      code === "EROFS" ||
      code === "ENOTSUP" ||
      code === "ENOTDIR"
    )
      return null;
    throw error;
  }
}
