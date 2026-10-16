import { resolve } from "node:path";
import type { RunyardClient } from "@runyard/client";
import { cliCatalogs, createTranslator, type Messages } from "@runyard/i18n";
import { absPath } from "@runyard/platform";
import type { CliDeps, CliIo } from "./cli-deps.ts";
import { type CliError, toCliError } from "./cli-error.ts";
import type { GlobalFlags } from "./commands/global-options.ts";
import { globalOptions } from "./commands/global-options.ts";
import { executeCommand, type Runtime } from "./execute-command.ts";
import { resolveLanguage } from "./language/resolve-language.ts";
import { Output } from "./output/output.ts";
import {
  globalsOf,
  type ParsedLine,
  parseLine,
  peekGlobals,
  type Resolved,
  resolveCommand,
} from "./parse-command-line.ts";
import { CliSettings } from "./settings/cli-settings.ts";

// 命令行的入口函数：参数、环境、输出流和依赖都从参数进来，返回退出码，不碰 process。
// 所以命令可以在进程内测试，只有极少数进程阶段的测试需要真正起进程。
// 步骤：解析（失败也留着，先“一瞥”全局参数，好知道用什么语言和格式报错）→ 建输出和翻译 → 执行。

type Parsed =
  | { ok: true; resolved: Resolved; line: ParsedLine; globals: GlobalFlags }
  | { ok: false; error: CliError; globals: GlobalFlags };

function parse(io: CliIo, deps: CliDeps): Parsed {
  const peeked = peekGlobals(io.argv);
  try {
    const resolved = resolveCommand(io.argv, deps.registry);
    const specs =
      resolved.kind === "command" ? [...globalOptions, ...resolved.command.options] : globalOptions;
    const skip = "wordIndexes" in resolved ? resolved.wordIndexes : [];
    const line = parseLine(io.argv, specs, skip);
    return { ok: true, resolved, line, globals: globalsOf(line) };
  } catch (error) {
    return { ok: false, error: toCliError(error), globals: peeked };
  }
}

async function createRuntime(io: CliIo, deps: CliDeps, globals: GlobalFlags) {
  const root = globals.root === undefined ? undefined : absPath(resolve(io.cwd, globals.root));
  const platform = deps.createPlatform(root);
  const settings = new CliSettings(platform, deps.now);
  const language = resolveLanguage({
    flag: globals.lang,
    env: io.env,
    saved: await settings.savedLang(),
  });
  const options = { platform: platform.id, catalogs: cliCatalogs };
  const translator = createTranslator<Messages>({ ...options, locale: language.locale });
  const english = createTranslator<Messages>({ ...options, locale: "en" });
  const out = new Output({
    stdout: io.stdout,
    stderr: io.stderr,
    json: globals.json,
    quiet: globals.quiet,
    t: translator.t,
    tEnglish: english.t,
  });
  if (language.unsupported !== undefined) {
    // 永远是英文，写到标准错误：不污染 --json 的标准输出（规格 CLI-COMMANDS-13）
    const { value, source } = language.unsupported;
    out.stderrLine(english.t("cli.lang.unsupported.hint", { value, source }));
  }
  return { platform, settings, language, translator, out };
}

export async function runCli(io: CliIo, deps: CliDeps): Promise<number> {
  const parsed = parse(io, deps);
  let client: Promise<RunyardClient> | undefined;
  let out: Output | undefined;
  try {
    const base = await createRuntime(io, deps, parsed.globals);
    out = base.out;
    if (!parsed.ok) throw parsed.error;
    const runtime: Runtime = {
      ...base,
      io,
      deps,
      getClient: () => {
        client ??= deps.connect(base.platform);
        return client;
      },
    };
    await executeCommand(runtime, parsed.resolved, parsed.line, parsed.globals);
    return 0;
  } catch (error) {
    return (out ?? fallbackOutput(io, parsed.globals)).error(toCliError(error));
  } finally {
    await closeQuietly(client);
  }
}

// 连建输出前的准备都失败了（比如平台层创建不了）：只能用英文报 INTERNAL。
// 平台编号只影响“废纸篓”一类用词，INTERNAL 的文案里没有，所以固定一个值。
function fallbackOutput(io: CliIo, globals: GlobalFlags): Output {
  const english = createTranslator<Messages>({
    locale: "en",
    platform: "darwin",
    catalogs: cliCatalogs,
  });
  return new Output({
    stdout: io.stdout,
    stderr: io.stderr,
    json: globals.json,
    quiet: globals.quiet,
    t: english.t,
    tEnglish: english.t,
  });
}

async function closeQuietly(client: Promise<RunyardClient> | undefined): Promise<void> {
  if (client === undefined) return;
  try {
    (await client).close();
  } catch {
    // 连接本来就没建成：错误已经作为命令的失败报告过了
  }
}
