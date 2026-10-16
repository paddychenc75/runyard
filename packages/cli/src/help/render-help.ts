import type { Localized, Translate } from "@runyard/i18n";
import {
  type CommandRegistry,
  type CommandSpec,
  commandWords,
  type GroupSpec,
  type OptionSpec,
  type PositionalSpec,
  type Text,
} from "../commands/command-spec.ts";
import { globalOptions } from "../commands/global-options.ts";

// --help 的正文。命令名、参数名、占位符（<pg>、<seconds>）永远不翻译，只翻译说明文字（规格 CLI-COMMANDS-15）。
// 布局：左列是写法，右列是说明，左列按最宽的一行对齐。

const PROGRAM = "runyard";
const INDENT = "  ";
const GAP = "  ";

type Row = { left: string; right: Localized };

function table(rows: readonly Row[]): string[] {
  const width = Math.max(0, ...rows.map((row) => row.left.length));
  return rows.map((row) => `${INDENT}${row.left.padEnd(width)}${GAP}${row.right}`);
}

function positionalText(positional: PositionalSpec): string {
  return positional.required ? `<${positional.name}>` : `[${positional.name}]`;
}

function optionText(option: OptionSpec): string {
  const value = option.type === "string" ? ` <${option.valueName ?? "value"}>` : "";
  return `--${option.name}${value}`;
}

function usageLine(command: CommandSpec): string {
  const positionals = command.positionals.map(positionalText);
  const options = command.options.length > 0 ? ["[options]"] : [];
  return [PROGRAM, ...commandWords(command), ...positionals, ...options].join(" ");
}

function section(heading: Localized, lines: readonly string[]): string[] {
  return ["", heading, ...lines];
}

function globalSection(t: Translate): string[] {
  const rows = globalOptions.map((option) => ({ left: optionText(option), right: option.hint(t) }));
  return section(t("cli.help.globalOptions.label"), table(rows));
}

function moreInfo(t: Translate, example: string): string[] {
  return ["", t("cli.help.moreInfo.hint", { example })];
}

/** `runyard --help`：命令一览。有子命令的组只列组名，子命令在 `runyard <组> --help` */
export function renderRootHelp(t: Translate, registry: CommandRegistry): string {
  const rows: Row[] = [];
  const seen = new Set<string>();
  for (const command of registry.commands) {
    const top = commandWords(command)[0] as string;
    if (seen.has(top)) continue;
    seen.add(top);
    const group = registry.groups.find((candidate) => candidate.name === top);
    if (group !== undefined) {
      rows.push({ left: `${top} <command>`, right: group.title(t) });
    } else {
      const positionals = command.positionals.map(positionalText).join(" ");
      rows.push({ left: `${top} ${positionals}`.trim(), right: command.title(t) });
    }
  }
  const lines = [
    `${PROGRAM} - ${t("cli.help.summary.title")}`,
    ...section(t("cli.help.usage.label"), [`${INDENT}${PROGRAM} <command> [options]`]),
    ...section(t("cli.help.commands.label"), table(rows)),
    ...globalSection(t),
    ...moreInfo(t, `${PROGRAM} <command> --help`),
  ];
  return `${lines.join("\n")}\n`;
}

/** `runyard <组> --help`：组里的子命令 */
export function renderGroupHelp(t: Translate, registry: CommandRegistry, group: GroupSpec): string {
  const members = registry.commands.filter((command) => commandWords(command)[0] === group.name);
  const rows = members.map((command) => ({
    left: commandWords(command).slice(1).concat(command.positionals.map(positionalText)).join(" "),
    right: command.title(t),
  }));
  const lines = [
    `${PROGRAM} ${group.name} - ${group.title(t)}`,
    ...section(t("cli.help.usage.label"), [
      `${INDENT}${PROGRAM} ${group.name} <command> [options]`,
    ]),
    ...section(t("cli.help.commands.label"), table(rows)),
    ...globalSection(t),
    ...moreInfo(t, `${PROGRAM} ${group.name} <command> --help`),
  ];
  return `${lines.join("\n")}\n`;
}

/** `runyard <命令> --help` */
export function renderCommandHelp(t: Translate, command: CommandSpec): string {
  const text = (value: Text): Localized => value(t);
  const lines = [
    `${PROGRAM} ${command.name} - ${text(command.title)}`,
    ...section(t("cli.help.usage.label"), [`${INDENT}${usageLine(command)}`]),
  ];
  if (command.positionals.length > 0) {
    const rows = command.positionals.map((p) => ({ left: p.name, right: text(p.hint) }));
    lines.push(...section(t("cli.help.arguments.label"), table(rows)));
  }
  if (command.options.length > 0) {
    const rows = command.options.map((o) => ({ left: optionText(o), right: text(o.hint) }));
    lines.push(...section(t("cli.help.options.label"), table(rows)));
  }
  lines.push(...globalSection(t));
  return `${lines.join("\n")}\n`;
}
