import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { connectSupervisor } from "@runyard/client";
import { absPath, getPlatform } from "@runyard/platform";
import pkg from "../package.json" with { type: "json" };
import type { CliDeps, CliHost } from "./cli-deps.ts";
import { builtinRegistry } from "./commands/declarations.ts";
import { createRealClock } from "./real-clock.ts";

// 组合根：把真的东西接到命令行上。管理进程入口文件和模板数据的位置是这里注入的配置值：
// 开发时从仓库源码运行（developmentConfig），随桌面应用安装时在应用的资源目录里（packagedConfig，main-packaged.ts）。
// client 不能导入 supervisor（layers.json），所以入口由命令行这一层传给它。

export interface CliConfig {
  /** 启动管理进程的命令前缀，client 在后面补 --home --version --build 等参数 */
  supervisorCommand: readonly string[];
  /** 管理进程的环境里要额外带的项：随应用安装时是 ELECTRON_RUN_AS_NODE，让应用的可执行文件当 Node 用 */
  supervisorEnv: Readonly<Record<string, string>>;
  /** 管理进程由 Electron 还是 Node 运行，写进发现文件 */
  supervisorHost: "electron" | "node";
  version: string;
  /** 构建标识；从源码运行没有构建过程，固定写 "source" */
  build: string;
  install: CliHost["install"];
  templates: CliHost["templates"];
}

export function developmentConfig(): CliConfig {
  const entry = new URL("../../supervisor/src/main.ts", import.meta.url);
  const data = (name: string) =>
    absPath(fileURLToPath(new URL(`../../../templates/${name}`, import.meta.url)));
  return {
    supervisorCommand: [process.execPath, entry.pathname],
    supervisorEnv: {},
    supervisorHost: "node",
    version: pkg.version,
    build: "source",
    install: {
      kind: "source",
      version: pkg.version,
      path: fileURLToPath(new URL("./main.ts", import.meta.url)),
    },
    templates: {
      builtinDir: data("builtin"),
      runnersDir: data("runners"),
      toolsDir: data("tools"),
    },
  };
}

/** 构建时写进应用资源目录的清单（apps/desktop/packaging/runtime-bundle.ts）：版本和构建标识与应用一致 */
export interface BundleManifest {
  version: string;
  build: string;
}

/**
 * 随应用安装的命令行：本文件被打成资源目录里的 runyard/cli.mjs，管理进程入口 supervisor.mjs
 * 和 templates/ 在它旁边，启动脚本 bin/runyard 在上一层。版本就是清单里的应用版本。
 */
export function packagedConfig(moduleUrl: string, manifest: BundleManifest): CliConfig {
  const here = (relative: string) => fileURLToPath(new URL(relative, moduleUrl));
  const data = (name: string) => absPath(here(`./templates/${name}`));
  return {
    supervisorCommand: [process.execPath, here("./supervisor.mjs")],
    supervisorEnv: { ELECTRON_RUN_AS_NODE: "1" },
    supervisorHost: "electron",
    version: manifest.version,
    build: manifest.build,
    install: { kind: "app", version: manifest.version, path: here("../bin/runyard") },
    templates: {
      builtinDir: data("builtin"),
      runnersDir: data("runners"),
      toolsDir: data("tools"),
    },
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
        launch: {
          command: config.supervisorCommand,
          host: config.supervisorHost,
          env: { ...config.supervisorEnv, HOME: homedir() },
        },
      }),
    now: () => Date.now(),
    host: createHost(config),
    registry: builtinRegistry,
  };
}

function createHost(config: CliConfig): CliDeps["host"] {
  return {
    install: config.install,
    templates: config.templates,
    tempDir: absPath(tmpdir()),
    clock: createRealClock(),
    // 另一份安装怎样自报版本要等桌面应用的安装方式定下来；现在只能按位置猜种类，版本未知
    probeInstall: async (path) => ({
      kind: path.includes(".app") ? "app" : "source",
      version: null,
    }),
  };
}
