import type { RunyardClient } from "@runyard/client";
import { type CliLocaleResolution, createFormat, type Translator } from "@runyard/i18n";
import type { Platform } from "@runyard/platform";
import type { CliDeps, CliIo } from "./cli-deps.ts";
import { cliError, usageError } from "./cli-error.ts";
import type { CommandContext } from "./commands/command-context.ts";
import type { CommandSpec } from "./commands/command-spec.ts";
import type { GlobalFlags } from "./commands/global-options.ts";
import { notImplemented } from "./commands/stub-command.ts";
import { renderCommandHelp, renderGroupHelp, renderRootHelp } from "./help/render-help.ts";
import type { Output } from "./output/output.ts";
import type { ParsedLine, Resolved } from "./parse-command-line.ts";
import type { CliSettings } from "./settings/cli-settings.ts";

export interface Runtime {
  io: CliIo;
  deps: CliDeps;
  out: Output;
  translator: Translator;
  language: CliLocaleResolution;
  platform: Platform;
  settings: CliSettings;
  getClient(): Promise<RunyardClient>;
}

// 解析成功之后：显示帮助，或执行命令。失败一律抛 CliError，由 runCli 统一变成输出和退出码。
export async function executeCommand(
  runtime: Runtime,
  resolved: Resolved,
  line: ParsedLine,
  globals: GlobalFlags,
): Promise<void> {
  const { out, translator, deps } = runtime;
  const text = translator.t;
  switch (resolved.kind) {
    case "none":
      if (globals.help) return out.help(renderRootHelp(text, deps.registry));
      throw usageError((t) => t("cli.usage.missingCommand.body"));
    case "unknown": {
      const command = resolved.words;
      throw usageError((t) => t("cli.usage.unknownCommand.body", { command }));
    }
    case "group":
      if (globals.help) return out.help(renderGroupHelp(text, deps.registry, resolved.group));
      throw usageError((t) => t("cli.usage.missingCommand.body"));
    case "command":
      if (globals.help) return out.help(renderCommandHelp(text, resolved.command));
      return runCommand(runtime, resolved.command, line, globals);
  }
}

async function runCommand(
  runtime: Runtime,
  command: CommandSpec,
  line: ParsedLine,
  globals: GlobalFlags,
): Promise<void> {
  checkPositionals(command, line.positionals);
  const { out, translator, deps } = runtime;
  const context: CommandContext = {
    positionals: line.positionals,
    global: globals,
    flag: (name) => line.options.has(name),
    value: (name) => {
      const value = line.options.get(name)?.at(-1);
      return typeof value === "string" ? value : undefined;
    },
    values: (name) => (line.options.get(name) ?? []).filter((v) => typeof v === "string"),
    t: translator.t,
    format: createFormat(translator),
    locale: translator.locale,
    language: runtime.language,
    out,
    platform: runtime.platform,
    env: definedEnv(runtime.io.env),
    settings: runtime.settings,
    host: deps.host,
    client: () => {
      if (!command.needsSupervisor) {
        // 声明了不需要管理进程的命令连了它：这是代码错误，不是用户的错
        throw cliError("INTERNAL", {});
      }
      return runtime.getClient();
    },
  };
  await (command.run ?? notImplemented)(context);
  // 命令成功却什么也没写：--json 下这会让调用方读到空输出，所以当作内部错误
  if (globals.json && !out.emitted) throw cliError("INTERNAL", {});
}

function checkPositionals(command: CommandSpec, positionals: readonly string[]): void {
  const missing = command.positionals.find((p, i) => p.required && positionals[i] === undefined);
  if (missing !== undefined) {
    const argument = `<${missing.name}>`;
    throw usageError((t) => t("cli.usage.missingArgument.body", { argument }));
  }
  const extra = positionals[command.positionals.length];
  if (extra !== undefined) {
    throw usageError((t) => t("cli.usage.tooManyArguments.body", { argument: extra }));
  }
}

function definedEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}
