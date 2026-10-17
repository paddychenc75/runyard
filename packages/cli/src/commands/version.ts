import type { Output } from "../output/output.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";

// version、--version、-v（规格 CLI-COMMANDS-85、86）：版本号来自安装信息，随应用安装时就是应用的版本。
// 不连管理进程。人读的输出只有版本号一行；--json 只有 version 字段，都不随语言变。
export function printVersion(out: Output, t: CommandContext["t"], version: string): void {
  out.result({ version }, [t("cli.version.body", { version })]);
}

export const versionCommand: CommandHandler = async (context) => {
  printVersion(context.out, context.t, context.host.install.version);
};
