import { joinPath, type Platform, posixRelPath } from "@runyard/platform";
import type { ToolDefinition, ToolRequirement } from "@runyard/protocol";

// 缺工具时的安装提示：只展示，从不执行（规格 TEMPLATES-FORMAT-35、-36、TEMPLATES-CUSTOM-21）。
// 选哪一条的核心规则（-35）归 core 安装模块（#36）；它合并之前，这里直接按工具定义的字段选，
// 对外只有 installHints 这一个函数，合并后换掉函数体即可。

export interface InstallHint {
  /** 来源：版本管理工具、Homebrew、官网，或模板自己写的 */
  readonly via: "versionManager" | "homebrew" | "official" | "template";
  /** 版本管理工具的名字（via 为 versionManager 时） */
  readonly manager?: string;
  readonly command?: readonly string[];
  readonly url?: string;
}

export interface InstallContext {
  /** 已经在用的版本管理工具的标识（如 nvm） */
  readonly managers: ReadonlySet<string>;
  readonly hasHomebrew: boolean;
}

export function installHints(
  definition: ToolDefinition | undefined,
  templateInstall: ToolRequirement["install"],
  context: InstallContext,
): InstallHint[] {
  const hints: InstallHint[] = [];
  const darwin = definition?.install.darwin;
  if (darwin !== undefined) {
    const manager = darwin.versionManagers?.find((candidate) => context.managers.has(candidate.id));
    if (manager !== undefined) {
      hints.push({ via: "versionManager", manager: manager.id, command: manager.command });
    } else if (context.hasHomebrew && darwin.homebrew !== undefined) {
      hints.push({ via: "homebrew", command: darwin.homebrew.command });
    }
    // 官网链接始终一起给出
    hints.push({ via: "official", url: darwin.url });
  }
  if (templateInstall !== undefined) {
    hints.push({
      via: "template",
      ...(templateInstall.command === undefined ? {} : { command: templateInstall.command }),
      ...(templateInstall.url === undefined ? {} : { url: templateInstall.url }),
    });
  }
  return hints;
}

/** 看这台电脑上有什么：用了哪些版本管理工具、有没有 Homebrew。只查找，不执行任何东西 */
export async function detectInstallContext(
  platform: Platform,
  definitions: Iterable<ToolDefinition>,
  env: Readonly<Record<string, string>>,
): Promise<InstallContext> {
  const ids = new Set<string>();
  for (const definition of definitions) {
    for (const manager of definition.install.darwin.versionManagers ?? []) ids.add(manager.id);
  }
  const managers = new Set<string>();
  const home = platform.paths.home;
  for (const id of ids) {
    const envDir = env[`${id.toUpperCase()}_DIR`];
    const dotDir = joinPath(home, posixRelPath(`.${id}`));
    if (envDir !== undefined || (await platform.fs.exists(dotDir))) managers.add(id);
  }
  const brew = await platform.exec.which("brew", env, home);
  return { managers, hasHomebrew: brew !== null };
}
