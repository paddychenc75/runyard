import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { connectSupervisor } from "@runyard/client";
import { absPath, getPlatform } from "@runyard/platform";
import pkg from "../package.json" with { type: "json" };
import type { CliDeps } from "./cli-deps.ts";
import { builtinRegistry } from "./commands/declarations.ts";
import { createRealClock } from "./real-clock.ts";

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
    // root 代替主目录：状态目录是 <root>/.runyard，资源库是 <root>/Runyard（cli-contract 未定第 5 项，暂按此实现）；
    // 登录 shell 仍用真实主目录，否则读不到用户的启动文件（issue #152）
    createPlatform: (root) =>
      getPlatform(root === undefined ? {} : { home: root, shellHome: absPath(homedir()) }),
    connect: (platform) =>
      connectSupervisor({
        platform,
        client: { kind: "cli", version: config.version, build: config.build },
        // 管理进程的环境本来是空的；把命令行看到的真实主目录交给它，它的登录 shell 才找得到启动文件
        launch: { command: config.supervisorCommand, env: { HOME: homedir() } },
      }),
    now: () => Date.now(),
    host: createHost(config),
    registry: builtinRegistry,
  };
}

// 开发时模板数据就在仓库的 templates/ 下；打包后的位置和 supervisorCommand 一样，等桌面应用的打包 issue 定
function createHost(config: CliConfig): CliDeps["host"] {
  const data = (name: string) =>
    absPath(fileURLToPath(new URL(`../../../templates/${name}`, import.meta.url)));
  return {
    install: {
      kind: "source",
      version: config.version,
      path: fileURLToPath(new URL("./main.ts", import.meta.url)),
    },
    templates: {
      builtinDir: data("builtin"),
      runnersDir: data("runners"),
      toolsDir: data("tools"),
    },
    tempDir: absPath(tmpdir()),
    clock: createRealClock(),
    // 另一份安装怎样自报版本要等桌面应用的安装方式定下来；现在只能按位置猜种类，版本未知
    probeInstall: async (path) => ({
      kind: path.includes(".app") ? "app" : "source",
      version: null,
    }),
  };
}
