import { absPath, joinPath, type Platform, posixRelPath } from "@runyard/platform";
import type { ToolDefinition, ToolRequirement } from "@runyard/protocol";

// 缺工具时给用户的安装提示（规格 TEMPLATES-FORMAT-35、36）。
// 只产出数据，从不执行：这个文件不接触 exec，也不返回可以直接运行的东西；
// 命令是给人看的参数数组，要不要执行是用户在自己终端里的决定。

export type InstallCommand = {
  /** 命令从哪来：模板自己写的，版本管理工具（如 nvm），Homebrew */
  readonly source: "template" | "version-manager" | "homebrew";
  /** 版本管理工具的 id，如 nvm；其余来源没有 */
  readonly manager?: string;
  readonly command: readonly string[];
};

export type InstallHint = {
  readonly tool: string;
  /** 按展示顺序：模板写的在前，其后是按本机已有的安装手段选出的那一条（最多一条） */
  readonly commands: readonly InstallCommand[];
  /** 官网链接，始终给出（去重）；工具定义和模板都没有链接时为空 */
  readonly urls: readonly string[];
};

/** 本机已有哪些安装手段 */
export type InstallContext = {
  /** 已装的版本管理工具 id，如 nvm */
  readonly versionManagers: ReadonlySet<string>;
  readonly homebrew: boolean;
};

export function selectInstallHint(input: {
  readonly tool: string;
  readonly definition?: ToolDefinition;
  readonly requirement?: ToolRequirement;
  readonly context: InstallContext;
}): InstallHint {
  const { tool, definition, requirement, context } = input;
  const commands: InstallCommand[] = [];
  const urls: string[] = [];
  const own = requirement?.install;
  if (own?.command !== undefined) commands.push({ source: "template", command: own.command });
  if (own?.url !== undefined) urls.push(own.url);

  const darwin = definition?.install.darwin;
  if (darwin !== undefined) {
    const manager = darwin.versionManagers?.find((candidate) =>
      context.versionManagers.has(candidate.id),
    );
    if (manager !== undefined) {
      commands.push({ source: "version-manager", manager: manager.id, command: manager.command });
    } else if (darwin.homebrew !== undefined && context.homebrew) {
      commands.push({ source: "homebrew", command: darwin.homebrew.command });
    }
    if (!urls.includes(darwin.url)) urls.push(darwin.url);
  }
  return { tool, commands, urls };
}

// nvm 是 shell 函数，PATH 上找不到可执行文件：看 NVM_DIR 或默认的 ~/.nvm
async function hasVersionManager(
  platform: Pick<Platform, "tools" | "fs" | "paths">,
  id: string,
  env: Readonly<Record<string, string>>,
): Promise<boolean> {
  if (id === "nvm") {
    const dir = env.NVM_DIR;
    const nvmDir =
      dir !== undefined && dir !== ""
        ? absPath(dir)
        : joinPath(platform.paths.home, posixRelPath(".nvm"));
    return platform.fs.exists(nvmDir);
  }
  return (await platform.tools.candidates(id, env)).length > 0;
}

/** 读本机有哪些安装手段；只读文件和 PATH，不起进程 */
export async function detectInstallContext(
  platform: Pick<Platform, "tools" | "fs" | "paths">,
  env: Readonly<Record<string, string>>,
  definitions: Iterable<ToolDefinition>,
): Promise<InstallContext> {
  const ids = new Set<string>();
  for (const definition of definitions) {
    for (const manager of definition.install.darwin.versionManagers ?? []) ids.add(manager.id);
  }
  const present = new Set<string>();
  for (const id of ids) if (await hasVersionManager(platform, id, env)) present.add(id);
  const homebrew = (await platform.tools.candidates("brew", env)).length > 0;
  return { versionManagers: present, homebrew };
}
