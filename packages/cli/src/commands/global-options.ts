import type { OptionSpec } from "./command-spec.ts";

// 全局参数（技术设计 §5.3）。每条命令都认它们，位置不限。
export const globalOptions: readonly OptionSpec[] = [
  { name: "json", type: "boolean", hint: (t) => t("cli.option.json.hint") },
  { name: "quiet", type: "boolean", hint: (t) => t("cli.option.quiet.hint") },
  { name: "root", type: "string", valueName: "dir", hint: (t) => t("cli.option.root.hint") },
  { name: "lang", type: "string", valueName: "locale", hint: (t) => t("cli.option.lang.hint") },
  { name: "help", type: "boolean", hint: (t) => t("cli.option.help.hint") },
  { name: "version", type: "boolean", hint: (t) => t("cli.option.version.hint") },
];

export interface GlobalFlags {
  json: boolean;
  quiet: boolean;
  help: boolean;
  version: boolean;
  root: string | undefined;
  lang: string | undefined;
}
