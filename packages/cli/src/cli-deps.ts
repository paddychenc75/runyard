import type { RunyardClient } from "@runyard/client";
import type { RunClock } from "@runyard/core";
import type { AbsPath, Platform } from "@runyard/platform";
import type { CommandRegistry } from "./commands/command-spec.ts";
import type { TextSink } from "./output/output.ts";

/** 一次调用的输入输出：入口把 process 的东西传进来，测试传假的 */
export interface CliIo {
  /** 不含 node 和脚本路径 */
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  stdout: TextSink;
  stderr: TextSink;
}

/** 本次运行的命令行自己是什么、模板数据在哪里：组合根给真的，测试给假的 */
export interface CliHost {
  /** 这一份命令行的来源：随应用安装，或从仓库源码运行 */
  readonly install: {
    readonly kind: "app" | "source";
    readonly version: string;
    readonly path: string;
  };
  /** 随应用发布的数据：内置模板、运行器、工具定义（用户模板在状态目录下，由平台层推出） */
  readonly templates: {
    readonly builtinDir: AbsPath;
    readonly runnersDir: AbsPath;
    readonly toolsDir: AbsPath;
  };
  /** 系统临时目录：诊断包默认写在这里 */
  readonly tempDir: AbsPath;
  readonly clock: RunClock;
  /** 长命令注册中断处理，完成后撤销；测试可不给 */
  onCancel?: (cancel: () => void) => () => void;
  /** 看一眼 PATH 上另一份 runyard 是哪种安装；认不出版本时 version 为 null */
  probeInstall(path: string): Promise<{ kind: "app" | "source"; version: string | null }>;
}

/** 注入的依赖：组合根（composition-root.ts）给真的，测试给假的 */
export interface CliDeps {
  /** root 是 --root 给的目录（已是绝对路径），没给是 undefined；它代替主目录 */
  createPlatform(root: AbsPath | undefined): Platform;
  /** 连管理进程；连不上就拉起。失败抛 ClientError */
  connect(platform: Platform): Promise<RunyardClient>;
  now(): number;
  host: CliHost;
  registry: CommandRegistry;
}
