import { lstat, readlink, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fail } from "./failure.ts";

// 把“项目 id 加相对路径”落到磁盘路径，并保证结果仍在项目文件夹内（技术设计 §6.5“路径”，
// 规格 desktop/editor「文件树里新建…」）。拒绝：绝对路径、`..` 段、反斜杠、NUL，
// 以及符号链接把落点带出项目文件夹的情形（含还不存在的目标：往上找到最近存在的祖先再核对）。
// 返回的路径是已解开符号链接的真实路径，调用方就用它读写，核对和使用之间不再有链接可换。
// 做不到的：核对之后、使用之前有人把某一段换成指向项目外的链接（TOCTOU），本机单用户场景下接受。

export interface Confined {
  /** 磁盘上的真实路径 */
  abs: string;
  /** 项目文件夹的真实路径 */
  root: string;
}

export type LeafMode =
  /** 跟随末段的符号链接（读、写文件内容、列目录） */
  | "follow"
  /** 末段若是链接就处理链接本身（改名、移到废纸篓）：只解析它所在的目录 */
  | "self";

function segmentsOf(rel: string): string[] {
  if (rel === "") return [];
  const segments = rel.split("/");
  const bad =
    rel.includes("\\") ||
    rel.includes("\0") ||
    segments.some((s) => s === "" || s === "." || s === "..");
  if (bad) throw fail("EDITOR_PATH_OUTSIDE", { path: rel });
  return segments;
}

function isInside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (rel.split(sep)[0] !== ".." && !isAbsolute(rel));
}

/** 最近存在的祖先（含自己）的真实路径，加上其后还不存在的段 */
async function realWithMissingTail(path: string): Promise<string> {
  const tail: string[] = [];
  let current = path;
  for (;;) {
    try {
      const real = await realpath(current);
      return tail.length === 0 ? real : join(real, ...tail.reverse());
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      // 悬空的符号链接：realpath 报 ENOENT，但链接本身在。无法确认它指向哪里，按逃出处理
      if ((await lstat(current).catch(() => null))?.isSymbolicLink()) {
        const target = resolve(dirname(current), await readlink(current));
        return target;
      }
      const parent = dirname(current);
      if (parent === current) throw error;
      tail.push(basename(current));
      current = parent;
    }
  }
}

export async function confine(
  projectFolder: string,
  rel: string,
  mode: LeafMode = "follow",
): Promise<Confined> {
  const segments = segmentsOf(rel);
  let root: string;
  try {
    root = await realpath(projectFolder);
  } catch {
    throw fail("EDITOR_NOT_FOUND", { path: "" });
  }
  if (segments.length === 0) return { abs: root, root };

  const lexical = join(root, ...segments);
  let abs: string;
  if (mode === "self") {
    const parent = await realWithMissingTail(dirname(lexical));
    abs = join(parent, basename(lexical));
  } else {
    abs = await realWithMissingTail(lexical);
  }
  if (!isInside(root, abs)) throw fail("EDITOR_PATH_OUTSIDE", { path: rel });
  return { abs, root };
}
