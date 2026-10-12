import { type FileHandle, lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises";
import { basename } from "node:path";
import { platformError } from "../../platform-error.ts";
import { errnoOf, fsError } from "./map-fs-error.ts";

// 改名但不覆盖已有的东西。POSIX 的 rename 会静默盖掉同名的空目录或文件（决策记录 0010 的数据丢失缺陷），
// 而 Node 没有“目标存在则失败”的改名。做法是先占位：目录用 mkdir、文件用独占创建（wx），
// 占位成功就说明名字是空的，再 rename 盖在自己刚建的空占位上，覆盖的只是占位。
// 占位到改名之间名字对别人可见（一个空目录或空文件），这是已知且接受的。

export type EntryKind = "directory" | "file";

/** 占住 target 这个名字；已存在返回 false，别的错误抛出 */
export async function reserveName(target: string, kind: EntryKind): Promise<boolean> {
  try {
    if (kind === "directory") {
      await mkdir(target);
    } else {
      const handle: FileHandle = await open(target, "wx", 0o600);
      await handle.close();
    }
    return true;
  } catch (error) {
    if (errnoOf(error) === "EEXIST") return false;
    throw error;
  }
}

/**
 * 放弃自己刚占的位（空目录或空文件）。失败就留着：它是空的，不含任何用户内容。
 * 只删“自己刚建的、空的”那一个条目，不是递归删除
 */
export async function removePlaceholder(target: string, kind: EntryKind): Promise<void> {
  try {
    // delete-allow: 只删本函数刚占的空位（空目录用 rmdir，空文件用 unlink），里面没有用户内容
    await (kind === "directory" ? rmdir(target) : unlink(target));
  } catch {
    // 留着也无妨，见上
  }
}

// 同一个条目：大小写不敏感的卷上 Demo 和 demo 是同一个目录，占位会撞上自己，这时只是改写法，直接改名不会盖掉别的东西
async function isSameEntry(a: string, b: string): Promise<boolean> {
  try {
    const [first, second] = await Promise.all([lstat(a), lstat(b)]);
    return first.dev === second.dev && first.ino === second.ino;
  } catch {
    return false;
  }
}

/** 目标已存在抛 NAME_EXISTS，原条目原样；其余错误按 fsError 翻译 */
export async function renameNoReplace(from: string, to: string, kind: EntryKind): Promise<void> {
  let reserved: boolean;
  try {
    reserved = await reserveName(to, kind);
  } catch (error) {
    throw fsError(error, to, "reserve");
  }
  if (!reserved) {
    if (from !== to && (await isSameEntry(from, to))) {
      try {
        await rename(from, to);
        return;
      } catch (error) {
        throw fsError(error, from, "rename");
      }
    }
    throw platformError("NAME_EXISTS", { name: basename(to) }, `target exists: ${to}`);
  }
  try {
    await rename(from, to);
  } catch (error) {
    await removePlaceholder(to, kind);
    throw fsError(error, from, "rename");
  }
}
