import { randomBytes } from "node:crypto";
import { open, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { AbsPath } from "../../path-types.ts";
import { fsError } from "./map-fs-error.ts";

// 原子写：临时文件和目标在同一个目录（同一个卷，rename 才是原子的），写完刷盘再改名盖掉目标。
// 任何一步出错或进程在中途死掉：目标要么还是旧内容，要么已经是完整的新内容，不会是半个文件。
// 进程在改名之前死掉会留下 `.<名字>.<随机>.tmp`，下次写同一个文件不受影响；清理不属于本函数。

const NORMAL_MODE = 0o644;
const PRIVATE_MODE = 0o600;

/** 可注入的几步，测试在“写完、改名之前”注入故障 */
export interface AtomicOps {
  /** 临时文件写完并刷盘之后、改名之前调用 */
  readonly beforeRename?: (temp: string, target: string) => Promise<void> | void;
}

async function existingMode(file: string): Promise<number | null> {
  try {
    return (await stat(file)).mode & 0o777;
  } catch {
    return null;
  }
}

export async function writeAtomic(
  file: AbsPath,
  data: string,
  opts: { private?: boolean } = {},
  ops: AtomicOps = {},
): Promise<void> {
  const temp = join(dirname(file), `.${basename(file)}.${randomBytes(6).toString("hex")}.tmp`);
  const mode = opts.private ? PRIVATE_MODE : ((await existingMode(file)) ?? NORMAL_MODE);
  try {
    // wx：临时名不会撞上别人的文件；创建时就带上最终权限，不存在先宽后紧的窗口
    const handle = await open(temp, "wx", mode);
    try {
      await handle.writeFile(data, "utf8");
      // 创建时的权限被 umask 收窄过，已有文件的权限要原样保住，所以显式设一次
      await handle.chmod(mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await ops.beforeRename?.(temp, file);
    await rename(temp, file);
  } catch (error) {
    // delete-allow: 只删本函数刚建的临时文件（写入没完成的半成品），不是用户的内容
    await unlink(temp).catch(() => undefined);
    throw fsError(error, file, "writeAtomic");
  }
}
