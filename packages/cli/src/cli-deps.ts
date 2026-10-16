import type { RunyardClient } from "@runyard/client";
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

/** 注入的依赖：组合根（composition-root.ts）给真的，测试给假的 */
export interface CliDeps {
  /** root 是 --root 给的目录（已是绝对路径），没给是 undefined；它代替主目录 */
  createPlatform(root: AbsPath | undefined): Platform;
  /** 连管理进程；连不上就拉起。失败抛 ClientError */
  connect(platform: Platform): Promise<RunyardClient>;
  now(): number;
  registry: CommandRegistry;
}
