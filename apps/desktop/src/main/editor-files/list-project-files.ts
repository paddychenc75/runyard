import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { isIgnoredProjectPath } from "../../shared/project-ignore.ts";

// 快速打开要的“项目里所有文件”（规格 DESKTOP-EDITOR-68 至 74）：递归列出相对路径（正斜杠），
// 跳过 .runyard、.git、依赖目录和构建产物目录（清单与文件监听共用，shared/project-ignore.ts）。
// 不跟进符号链接的文件夹，免得绕圈或走出项目；链接指向的文件照常列出。

/** 文件数上限：再多的项目快速打开也没法用，宁可截断也不卡住主进程 */
export const MAX_LISTED_FILES = 200_000;

export async function listProjectFiles(folder: string): Promise<string[]> {
  const files: string[] = [];
  // 用显式的栈而不是递归，深目录不会爆调用栈
  const pending: string[] = [""];
  while (pending.length > 0 && files.length < MAX_LISTED_FILES) {
    const dir = pending.pop() ?? "";
    const entries = await readdir(dir === "" ? folder : join(folder, dir), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (isIgnoredProjectPath(path)) continue;
      if (entry.isDirectory()) pending.push(path);
      // 符号链接指向文件夹的不跟进也不列出（打开它没有意义）；指向文件或悬空的照常列出
      else if (
        !entry.isSymbolicLink() ||
        !(await stat(join(folder, path)).catch(() => null))?.isDirectory()
      ) {
        files.push(path);
      }
    }
  }
  return files;
}
