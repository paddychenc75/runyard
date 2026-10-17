import { lstat, mkdir, readlink, symlink, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// 把随应用安装的 runyard 接到 PATH 上，或撤掉（macOS，技术设计 §5.4）：在用户的 bin 目录建一个符号链接，
// 指向应用资源目录里的启动脚本 Contents/Resources/bin/runyard。只动指向本应用启动脚本的链接，
// 别的东西（用户自己装的 runyard、普通文件、指向别处的链接）一律不碰。

/** 链接的默认位置：用户目录下的 .local/bin（不需要管理员权限；是否在 PATH 上由调用方告诉用户） */
export function defaultCliBinDir(home: string = homedir()): string {
  return join(home, ".local", "bin");
}

/** 启动脚本在资源目录里的位置 */
export function cliLauncherPath(resourcesPath: string): string {
  return join(resourcesPath, "bin", "runyard");
}

/** 一个链接目标是不是“某个 Runyard 应用里的启动脚本”（应用可能被移动或换过位置，所以只认形状） */
export function isRunyardLauncher(target: string): boolean {
  return /\/Contents\/Resources\/bin\/runyard$/.test(target);
}

export type CliLinkResult =
  | { status: "installed"; link: string; target: string }
  | { status: "already-installed"; link: string; target: string }
  | { status: "removed"; link: string }
  | { status: "absent"; link: string }
  /** 目标位置已有别的东西（普通文件、指向别处的链接）：没有动它 */
  | { status: "conflict"; link: string };

async function readLinkTarget(link: string): Promise<string | null | "other"> {
  try {
    const stat = await lstat(link);
    return stat.isSymbolicLink() ? await readlink(link) : "other";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function installCliLink(binDir: string, launcher: string): Promise<CliLinkResult> {
  const link = join(binDir, "runyard");
  const current = await readLinkTarget(link);
  if (current === launcher) return { status: "already-installed", link, target: launcher };
  // 已有的链接只有指向某个 Runyard 应用（比如应用搬了家）才替换
  if (current === "other" || (current !== null && !isRunyardLauncher(current))) {
    return { status: "conflict", link };
  }
  await mkdir(binDir, { recursive: true });
  // delete-allow: 只删指向某个 Runyard 应用启动脚本的符号链接本身（上面已核对），不是用户的内容
  if (current !== null) await unlink(link);
  await symlink(launcher, link);
  return { status: "installed", link, target: launcher };
}

export async function uninstallCliLink(binDir: string): Promise<CliLinkResult> {
  const link = join(binDir, "runyard");
  const current = await readLinkTarget(link);
  if (current === null) return { status: "absent", link };
  if (current === "other" || !isRunyardLauncher(current)) return { status: "conflict", link };
  // delete-allow: 卸载自己建的符号链接（上面已核对指向 Runyard 应用），不是用户的内容
  await unlink(link);
  return { status: "removed", link };
}

export type CliLinkState =
  | { status: "absent"; link: string }
  /** 指向本应用的启动脚本 */
  | { status: "current"; link: string }
  /** 指向某个 Runyard 应用，但不是这一个（应用搬过家）：再安装一次就改指过来 */
  | { status: "stale"; link: string; target: string }
  /** 那个位置是别的东西：不碰它 */
  | { status: "conflict"; link: string };

/** 只读：看链接现在是什么状态，设置页据此显示（规格 DESKTOP-SETTINGS-20） */
export async function readCliLink(binDir: string, launcher: string): Promise<CliLinkState> {
  const link = join(binDir, "runyard");
  const current = await readLinkTarget(link);
  if (current === null) return { status: "absent", link };
  if (current === "other") return { status: "conflict", link };
  if (current === launcher) return { status: "current", link };
  return isRunyardLauncher(current)
    ? { status: "stale", link, target: current }
    : { status: "conflict", link };
}
