import { isAbsolute } from "node:path";
import { type AbsPath, absPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";

// 按标识或文件夹路径找到一个模板文件夹（template lint、doctor --template 共用）。
// 标识先找内置的，再找用户的（内置的优先，规格 TEMPLATES-CUSTOM-22）；绝对路径就是那个文件夹。

/** 模板、运行器、工具定义在磁盘上的位置（组合根给：开发时是仓库的 templates/，用户模板在状态目录下） */
export interface TemplateLocations {
  readonly builtinDir: AbsPath;
  readonly userDir: AbsPath;
  readonly runnersDir: AbsPath;
  readonly toolsDir: AbsPath;
}

export interface TemplateTarget {
  readonly dir: AbsPath;
  /** 标识或文件夹名 */
  readonly name: string;
  readonly builtin: boolean;
  /** 放在模板目录里：文件夹名必须等于 id */
  readonly inTemplateDir: boolean;
  readonly user: boolean;
}

const hasTemplateJson = async (platform: Platform, dir: AbsPath): Promise<boolean> =>
  (await platform.fs.readText(joinPath(dir, posixRelPath("template.json")))) !== null;

export async function locateTemplate(
  platform: Platform,
  locations: TemplateLocations,
  ref: string,
): Promise<TemplateTarget | null> {
  if (isAbsolute(ref)) {
    const dir = absPath(ref);
    if (!(await hasTemplateJson(platform, dir))) return null;
    const name = ref.split(/[\\/]/).filter(Boolean).at(-1) ?? ref;
    const inUserDir = joinPath(locations.userDir, posixRelPath(name)) === dir;
    return { dir, name, builtin: false, inTemplateDir: inUserDir, user: inUserDir };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(ref)) return null;
  const id = posixRelPath(ref);
  const builtin = joinPath(locations.builtinDir, id);
  if (await hasTemplateJson(platform, builtin)) {
    return { dir: builtin, name: ref, builtin: true, inTemplateDir: true, user: false };
  }
  const user = joinPath(locations.userDir, id);
  if (await hasTemplateJson(platform, user)) {
    return { dir: user, name: ref, builtin: false, inTemplateDir: true, user: true };
  }
  return null;
}
