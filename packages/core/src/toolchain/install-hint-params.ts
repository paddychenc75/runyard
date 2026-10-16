import type { ToolRequirement } from "@runyard/protocol";

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
