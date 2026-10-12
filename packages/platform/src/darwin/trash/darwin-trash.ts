import { lstat } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import type { Platform, TrashResult } from "../../platform.ts";
import { platformError } from "../../platform-error.ts";
import { errnoOf, fsError } from "../../posix/fs/map-fs-error.ts";
import type { EntryKind } from "../../posix/fs/rename-no-replace.ts";
import { trashByVerifiedCopy } from "./remove-after-verified-copy.ts";
import { placeInTrash } from "./reserve-in-trash.ts";
import { isUsable } from "./system-trash-tool.ts";
import { defaultTrashOps, type TrashConfig, type TrashOps } from "./trash-deps.ts";
import { homeTrashDir, volumeTrashDir } from "./volume-trash-dir.ts";

// macOS 的 fs.trash（决策记录 0010）。顺序：
//   1. 系统自带的 /usr/bin/trash（有就用：保留“放回原处”）；
//   2. 在条目所在卷的废纸篓目录里先占位再改名（不列目录、不对已有名字直接改名）；
//   3. 卷上没有废纸篓目录或改名跨了卷：复制、核对、再删原件（remove-after-verified-copy.ts）。
// 不用 osascript/Finder（要 Automation 权限）。任何一步失败原件都原样保留，绝不退到永久删除。

const notRestorable: TrashResult = { restorable: false, removedDirectly: [] };

export function createDarwinTrash(config: TrashConfig): Platform["fs"]["trash"] {
  const ops: TrashOps = { ...defaultTrashOps, ...config.ops };

  return async (dir: AbsPath): Promise<TrashResult> => {
    const name = basename(dir);
    const unavailable = (debug: string) => platformError("TRASH_UNAVAILABLE", { name }, debug);

    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(dir);
    } catch (error) {
      if (errnoOf(error) === "ENOENT") {
        throw platformError("FOLDER_MISSING", { name }, `no such folder: ${dir}`);
      }
      throw fsError(error, dir, "lstat");
    }
    // 条目本身是挂载点（卷的根）：移走它没有意义，也不安全
    if ((await lstat(dirname(dir)).catch(() => null))?.dev !== info.dev) {
      throw unavailable(`refusing to trash a volume root: ${dir}`);
    }
    // 符号链接按文件处理：移走的是链接本身，目标目录完好（K9 实测）
    const kind: EntryKind = info.isDirectory() ? "directory" : "file";

    const tool = config.systemTool;
    if (tool !== null && (await isUsable(tool))) {
      const code = await ops.runTool(tool, [dir]).catch(() => null);
      const stillThere = (await lstat(dir).catch(() => null)) !== null;
      if (code === 0 && !stillThere) return { restorable: true, removedDirectly: [] };
      // 工具失败但原件已经不在：它不会永久删除，所以东西在废纸篓里，只是不知道能不能放回原处
      if (!stillThere) return notRestorable;
    }

    let trashDir: string | null;
    try {
      trashDir = await volumeTrashDir(config.home, config.uid, dir, info.dev);
    } catch (error) {
      throw unavailable(`no usable trash directory: ${String(error)}`);
    }

    if (trashDir !== null) {
      try {
        await placeInTrash(dir, name, kind, trashDir, ops, config.now);
        return notRestorable;
      } catch (error) {
        // 只有跨卷才值得走复制兜底；其余（没权限、废纸篓不可写）直接失败
        if (errnoOf(error) !== "EXDEV")
          throw unavailable(`could not move into the trash: ${String(error)}`);
      }
    }
    // 兜底的临时副本放在 ~/.Trash 下，最后改名放进去，所以只需要主目录的废纸篓可写
    let target: string;
    try {
      target = await homeTrashDir(config.home);
    } catch (error) {
      throw unavailable(`no usable trash directory: ${String(error)}`);
    }
    await trashByVerifiedCopy(dir, kind, target, ops, config.now);
    return notRestorable;
  };
}
