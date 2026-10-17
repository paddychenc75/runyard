import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { templateDefaultExclusion } from "@runyard/protocol";
import type { ExcludedEntry } from "../shared/templates-view.ts";

// 另存为模板弹窗里的文件树（规格 DESKTOP-TEMPLATES-VIEW-07）：哪些文件默认进模板、哪些默认不进，
// 规则是协议包的 templateDefaultExclusion，管理进程另存时按的是同一份，所以弹窗里勾的和实际存的一致。
// 默认不进的目录只列它自己，不进去看；不跟进符号链接的文件夹，免得绕圈或走出项目。

/** 文件数上限：再多的项目弹窗也没法用，宁可截断也不卡住主进程 */
export const MAX_PLAN_FILES = 20_000;

export interface ProjectFilePlan {
  files: string[];
  excluded: ExcludedEntry[];
}

export async function planProjectFiles(folder: string): Promise<ProjectFilePlan> {
  const files: string[] = [];
  const excluded: ExcludedEntry[] = [];
  const pending: string[] = [""];
  while (pending.length > 0 && files.length < MAX_PLAN_FILES) {
    const dir = pending.pop() ?? "";
    const entries = await readdir(dir === "" ? folder : join(folder, dir), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      // .runyard/ 是应用自己的文件夹，永远不进模板，弹窗里也不露出来
      if (path === ".runyard") continue;
      const directory =
        entry.isDirectory() ||
        (entry.isSymbolicLink() &&
          (await stat(join(folder, path)).catch(() => null))?.isDirectory() === true);
      const reason = templateDefaultExclusion(path, directory);
      if (reason === "internal") continue;
      if (reason !== null) {
        excluded.push({ path, directory, reason });
      } else if (entry.isDirectory()) {
        pending.push(path);
      } else if (!directory) {
        files.push(path);
      }
    }
  }
  const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  files.sort(byPath);
  excluded.sort((a, b) => byPath(a.path, b.path));
  return { files, excluded };
}
