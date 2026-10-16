import type { Localized, Translate } from "@runyard/i18n";
import type { CommandContext } from "./command-context.ts";

// 一条命令的声明：名字、参数、选项、说明文字和（可选的）实现。
// 说明文字写成 (t) => t("键") 而不是字符串：键必须以字面量出现在 t() 里，
// i18n-keys / i18n-unused 才查得到；类型保证写错键或漏传参数是编译错误。
export type Text = (t: Translate) => Localized;

export interface PositionalSpec {
  /** 帮助里显示的名字，不翻译，如 pg、template */
  name: string;
  required: boolean;
  hint: Text;
}

export interface OptionSpec {
  /** 不带 `--` 的名字，如 clean-after；命令名和选项名不翻译 */
  name: string;
  type: "boolean" | "string";
  /** 可以重复给（如 --var） */
  multiple?: boolean;
  /** 帮助里值的占位，如 `--timeout <seconds>` 的 seconds；boolean 选项不写 */
  valueName?: string;
  hint: Text;
}

export type CommandHandler = (context: CommandContext) => Promise<void>;

export interface CommandSpec {
  /** 命令名，子命令用空格连接，如 "new"、"config get"；命令名不翻译 */
  name: string;
  title: Text;
  positionals: readonly PositionalSpec[];
  options: readonly OptionSpec[];
  /** 要不要连管理进程。声明为 false 的命令调用 context.client() 会得到 INTERNAL，防止误连 */
  needsSupervisor: boolean;
  /** 没有实现的命令不写；运行时得到 NOT_SUPPORTED（退出码 10），由后续 issue 补上 */
  run?: CommandHandler;
}

/** 有子命令的一组，如 config、template、skill；只在帮助里出现 */
export interface GroupSpec {
  name: string;
  title: Text;
}

export interface CommandRegistry {
  commands: readonly CommandSpec[];
  groups: readonly GroupSpec[];
}

export function defineCommand(spec: CommandSpec): CommandSpec {
  return spec;
}

/** 命令名拆成词：["config", "get"] */
export function commandWords(spec: CommandSpec): string[] {
  return spec.name.split(" ");
}
