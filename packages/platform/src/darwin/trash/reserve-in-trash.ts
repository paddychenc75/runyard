import { extname, join } from "node:path";
import {
  type EntryKind,
  removePlaceholder,
  reserveName,
} from "../../posix/fs/rename-no-replace.ts";
import type { TrashOps } from "./trash-deps.ts";

// 把条目放进废纸篓目录，不覆盖里面已有的任何东西（规格 LIBRARY-PLAYGROUNDS-20）。
// 做法（决策记录 0010 第 6.1 节）：先占位（目录 mkdir、文件独占创建），占住了再把条目改名盖在自己的占位上；
// 重名就换名字：`名字`、`名字 时.分.秒`、`名字 时.分.秒 2`……不列目录。
// 绝不对已有名字直接 rename：它会静默盖掉同名的空目录（K9 实测的数据丢失缺陷）。

const MAX_ATTEMPTS = 1000;

export function* trashNameCandidates(name: string, kind: EntryKind, at: Date): Generator<string> {
  yield name;
  const ext = kind === "file" ? extname(name) : "";
  const base = ext === "" ? name : name.slice(0, -ext.length);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;
  yield `${base} ${stamp}${ext}`;
  for (let n = 2; n <= MAX_ATTEMPTS; n++) yield `${base} ${stamp} ${n}${ext}`;
}

/** 返回条目在废纸篓里的最终路径。改名失败时放弃占位并把错误抛出，原条目原样 */
export async function placeInTrash(
  item: string,
  name: string,
  kind: EntryKind,
  trashDir: string,
  ops: Pick<TrashOps, "rename">,
  now: () => Date,
): Promise<string> {
  for (const candidate of trashNameCandidates(name, kind, now())) {
    const target = join(trashDir, candidate);
    if (!(await reserveName(target, kind))) continue;
    try {
      await ops.rename(item, target);
    } catch (error) {
      await removePlaceholder(target, kind);
      throw error;
    }
    return target;
  }
  throw new Error(`no free name in the trash for ${name}`);
}
