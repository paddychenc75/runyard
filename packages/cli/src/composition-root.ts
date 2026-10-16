import { connectSupervisor } from "@runyard/client";
import { getPlatform } from "@runyard/platform";
import pkg from "../package.json" with { type: "json" };
import type { CliDeps } from "./cli-deps.ts";
import { builtinRegistry } from "./commands/declarations.ts";

// 组合根：把真的东西接到命令行上。管理进程入口文件的位置是这里唯一一个注入的配置值
// （packaged 之后的位置还没定，由桌面应用的打包 issue 决定；现在只有开发时从仓库源码运行的路径）。
// client 不能导入 supervisor（layers.json），所以入口由命令行这一层传给它。

export interface CliConfig {
  /** 启动管理进程的命令前缀，client 在后面补 --home --version --build 等参数 */
  supervisorCommand: readonly string[];
  version: string;
  /** 构建标识；从源码运行没有构建过程，固定写 "source" */
  build: string;
}

export function developmentConfig(): CliConfig {
  const entry = new URL("../../supervisor/src/main.ts", import.meta.url);
  return {
    supervisorCommand: [process.execPath, entry.pathname],
    version: pkg.version,
    build: "source",
  };
}

export function createDeps(config: CliConfig): CliDeps {
  return {
    // root 代替主目录：状态目录是 <root>/.runyard，资源库是 <root>/Runyard（cli-contract 未定第 5 项，暂按此实现）
    createPlatform: (root) => getPlatform(root === undefined ? {} : { home: root }),
    connect: (platform) =>
      connectSupervisor({
        platform,
        client: { kind: "cli", version: config.version, build: config.build },
        launch: { command: config.supervisorCommand },
      }),
    now: () => Date.now(),
    registry: builtinRegistry,
  };
}
