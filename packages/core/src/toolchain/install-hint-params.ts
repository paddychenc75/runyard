import type { ToolDefinition, ToolRequirement } from "@runyard/protocol";

// 项目自己写的安装方式变成错误参数（规格 TEMPLATES-CUSTOM-21）。只产出数据，从不执行：
// 命令是参数数组，给人看时用空格连成一行，含空白的参数加引号。

export interface InstallHintParams {
  readonly installCommand?: string;
  readonly installUrl?: string;
}

const display = (arg: string) => (/\s|"/.test(arg) ? JSON.stringify(arg) : arg);

export function installHintParams(install: ToolRequirement["install"]): InstallHintParams {
  if (install === undefined) return {};
  return {
    ...(install.command === undefined
      ? {}
      : { installCommand: install.command.map(display).join(" ") }),
    ...(install.url === undefined ? {} : { installUrl: install.url }),
  };
}

/**
 * 工具定义里当前系统的安装方式（#228）：Homebrew 的命令（展示用的一行，只复制不执行）加官网。
 * 模板自己写的优先，所以调用方把模板的盖在它上面。第一版只有 darwin 的定义；别的系统没有就是空。
 */
export function definitionInstallParams(
  definition: ToolDefinition | undefined,
  platformId: string,
): InstallHintParams {
  const install = platformId === "darwin" ? definition?.install.darwin : undefined;
  if (install === undefined) return {};
  const command = install.homebrew?.command;
  return {
    ...(command === undefined ? {} : { installCommand: command.map(display).join(" ") }),
    installUrl: install.url,
  };
}
