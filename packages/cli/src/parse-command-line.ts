import { parseArgs } from "node:util";
import { usageError } from "./cli-error.ts";
import type {
  CommandRegistry,
  CommandSpec,
  GroupSpec,
  OptionSpec,
} from "./commands/command-spec.ts";
import type { GlobalFlags } from "./commands/global-options.ts";

// 参数解析只用 Node 自带的 util.parseArgs 做分词（tokens），校验自己做：
// parseArgs 的严格模式靠错误消息区分“未知选项”“缺值”，消息文字不是接口，所以不依赖它。

export interface ParsedLine {
  /** 命令词之后剩下的位置参数 */
  positionals: string[];
  /** 选项名 → 给过的值（boolean 选项是 true）。同名重复时按顺序保存 */
  options: Map<string, (string | true)[]>;
}

const VALUE_GLOBALS = new Set(["--root", "--lang"]);

// 命令词是第一个（和有子命令时的第二个）不以 - 开头、且不是 --root / --lang 的值的参数。
// 命令的选项一定出现在命令词之后，所以这里不需要认识它们。
export type Resolved =
  | { kind: "none" }
  | { kind: "command"; command: CommandSpec; wordIndexes: number[] }
  | { kind: "group"; group: GroupSpec; wordIndexes: number[] }
  | { kind: "unknown"; words: string };

export function resolveCommand(args: readonly string[], registry: CommandRegistry): Resolved {
  const words: { word: string; index: number }[] = [];
  for (let i = 0; i < args.length && words.length < 2; i++) {
    const arg = args[i] as string;
    if (arg === "--") break;
    if (VALUE_GLOBALS.has(arg)) {
      i++;
      continue;
    }
    if (!arg.startsWith("-")) words.push({ word: arg, index: i });
  }
  const first = words[0];
  if (first === undefined) return { kind: "none" };
  const group = registry.groups.find((candidate) => candidate.name === first.word);
  if (group === undefined) {
    const command = registry.commands.find((c) => c.name === first.word);
    return command === undefined
      ? { kind: "unknown", words: first.word }
      : { kind: "command", command, wordIndexes: [first.index] };
  }
  const second = words[1];
  if (second === undefined) return { kind: "group", group, wordIndexes: [first.index] };
  const command = registry.commands.find((c) => c.name === `${first.word} ${second.word}`);
  return command === undefined
    ? { kind: "unknown", words: `${first.word} ${second.word}` }
    : { kind: "command", command, wordIndexes: [first.index, second.index] };
}

// 严格校验：未知选项、缺值、布尔选项带了值都是 USAGE。
export function parseLine(
  args: readonly string[],
  specs: readonly OptionSpec[],
  skipIndexes: readonly number[],
): ParsedLine {
  const byName = new Map(specs.map((spec) => [spec.name, spec]));
  const { tokens } = parseArgs({
    args: [...args],
    options: Object.fromEntries(
      specs.map((spec) => [
        spec.name,
        {
          type: spec.type,
          ...(spec.multiple ? { multiple: true } : {}),
          ...(spec.name === "help" ? { short: "h" } : {}),
          ...(spec.name === "version" ? { short: "v" } : {}),
        },
      ]),
    ),
    strict: false,
    allowPositionals: true,
    tokens: true,
  });
  const positionals: string[] = [];
  const options = new Map<string, (string | true)[]>();
  for (const token of tokens) {
    if (token.kind === "positional") {
      if (!skipIndexes.includes(token.index)) positionals.push(token.value);
      continue;
    }
    if (token.kind !== "option") continue;
    const name = token.name;
    const spec = byName.get(name);
    const option = token.rawName;
    if (spec === undefined) throw usageError((t) => t("cli.usage.unknownOption.body", { option }));
    if (spec.type === "boolean") {
      if (token.inlineValue === true) {
        throw usageError((t) => t("cli.usage.optionTakesNoValue.body", { option }));
      }
      options.set(name, [true]);
      continue;
    }
    if (token.value === undefined) {
      throw usageError((t) => t("cli.usage.optionNeedsValue.body", { option }));
    }
    const given = options.get(name) ?? [];
    options.set(name, spec.multiple ? [...given, token.value] : [token.value]);
  }
  return { positionals, options };
}

// 不报错的快速一瞥：解析失败时也要知道用哪种格式、哪种语言报告错误
export function peekGlobals(args: readonly string[]): GlobalFlags {
  const { values } = parseArgs({
    args: [...args],
    options: {
      json: { type: "boolean" },
      quiet: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      root: { type: "string" },
      lang: { type: "string" },
    },
    strict: false,
    allowPositionals: true,
  });
  const text = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;
  return {
    json: values.json === true,
    quiet: values.quiet === true,
    help: values.help === true,
    version: values.version === true,
    root: text(values.root),
    lang: text(values.lang),
  };
}

export function globalsOf(line: ParsedLine): GlobalFlags {
  const last = (name: string): string | undefined => {
    const value = line.options.get(name)?.at(-1);
    return typeof value === "string" ? value : undefined;
  };
  return {
    json: line.options.has("json"),
    quiet: line.options.has("quiet"),
    help: line.options.has("help"),
    version: line.options.has("version"),
    root: last("root"),
    lang: last("lang"),
  };
}
