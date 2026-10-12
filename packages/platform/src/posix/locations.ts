import { isAbsolute, join, relative, sep } from "node:path/posix";
import type { AbsPath } from "../path-types.ts";

// 判断一个路径落在哪类“位置”里：纯函数，不读磁盘，所以任何系统上都能测。
// 用途是设置里选资源库位置时给警告（技术设计 §4.2 末段，K6 决策记录 0009）。

export interface LocationRules {
  home: AbsPath;
  /** macOS 的默认卷不分大小写；比较时要统一，否则 ~/documents 逃过判断 */
  caseInsensitive: boolean;
  /** 相对主目录的网盘同步目录；以 `*` 结尾表示“以此开头的任何名字”（如 OneDrive - 公司名） */
  cloudDirs: readonly string[];
  /** 相对主目录的“桌面”“文档”“下载” */
  userFolders: readonly string[];
}

// relative 的结果以 `..` 开头或是绝对路径，说明 path 在 parent 之外
function escapes(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function isInside(path: string, parent: string, caseInsensitive: boolean): boolean {
  const fold = (value: string) => (caseInsensitive ? value.toLowerCase() : value);
  return !escapes(relative(fold(parent), fold(path)));
}

export function isInUserFolders(path: AbsPath, rules: LocationRules): boolean {
  return rules.userFolders.some((dir) =>
    isInside(path, join(rules.home, dir), rules.caseInsensitive),
  );
}

export function isCloudSynced(path: AbsPath, rules: LocationRules): boolean {
  const fold = (value: string) => (rules.caseInsensitive ? value.toLowerCase() : value);
  const rel = relative(fold(rules.home), fold(path));
  if (rel === "" || escapes(rel)) return false;
  return rules.cloudDirs.some((dir) => {
    const wanted = fold(dir);
    if (!wanted.endsWith("*")) return rel === wanted || rel.startsWith(`${wanted}${sep}`);
    return rel.startsWith(wanted.slice(0, -1));
  });
}
