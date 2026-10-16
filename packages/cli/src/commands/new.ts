import { cliError, usageError } from "../cli-error.ts";
import { detectCaller } from "../creator/detect-creator.ts";
import type { JsonObject } from "../output/output.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";
import {
  announce,
  DEFAULT_TIMEOUT_SECONDS,
  parsePositive,
  runLines,
  startAndReport,
} from "./start-run.ts";

// runyard new <template> [name]（规格 CLI-COMMANDS-24 到 32、LIBRARY-AUTO-CLEAN-01 到 04；PRD #prd-cli、#prd-cli-clean-after）。
// 先把所有参数检查完再连管理进程：参数不对时不创建任何文件夹。

/** `--var k=v`：写法不对或键是 name（名称已由项目名提供）都是 VAR_INVALID，key 取用户写的键 */
function parseVars(raw: readonly string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const item of raw) {
    const at = item.indexOf("=");
    const key = at === -1 ? item : item.slice(0, at);
    if (at === -1 || key === "" || key === "name") {
      throw cliError("VAR_INVALID", { key: key === "" ? item : key });
    }
    vars[key] = item.slice(at + 1);
  }
  return vars;
}

/** `--clean-after 30d`：正整数加 d */
function parseCleanAfter(context: CommandContext): number | undefined {
  const value = context.value("clean-after");
  if (value === undefined) return undefined;
  const match = /^([1-9][0-9]*)d$/.exec(value);
  if (match === null) {
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: "--clean-after", value }));
  }
  return Number(match[1]);
}

function parseIfExists(context: CommandContext): "reuse" | "fail" {
  const value = context.value("if-exists") ?? "fail";
  if (value !== "reuse" && value !== "fail") {
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: "--if-exists", value }));
  }
  return value;
}

export const newPlayground: CommandHandler = async (context) => {
  const [template = "", name] = context.positionals;
  const vars = parseVars(context.values("var"));
  const autoClean = parseCleanAfter(context);
  const ifExists = parseIfExists(context);
  const timeoutSeconds = parsePositive(context, "timeout") ?? DEFAULT_TIMEOUT_SECONDS;
  const note = context.value("note");
  const { createdBy, owner } = detectCaller(
    context.env,
    ["runyard new", template, name].filter((word) => word !== undefined).join(" "),
  );

  const client = await context.client();
  const created = await client.call("playground.create", {
    template,
    ...(name === undefined ? {} : { name }),
    ...(note === undefined ? {} : { note }),
    ...(autoClean === undefined ? {} : { autoClean }),
    ...(Object.keys(vars).length === 0 ? {} : { vars }),
    ifExists,
    createdBy,
  });
  for (const notice of created.notices ?? []) context.out.notice(notice);
  const { playground } = created;
  const where = { name: playground.name, path: playground.path };
  const createdLine = created.created
    ? context.t("cli.new.created.body", where)
    : context.t("cli.new.reused.body", where);
  const base: JsonObject = {
    id: playground.id,
    name: playground.name,
    path: playground.path,
    template: playground.template.id,
    created: created.created,
    ...(playground.entry === undefined ? {} : { entry: playground.entry }),
    retention: playground.autoClean.enabled ? "autoClean" : "kept",
  };
  if (!context.flag("run")) {
    context.out.result(base, [createdLine]);
    return;
  }

  // 创建成功而启动失败时，项目留着（错误直接冒出去，文件夹不动）
  context.out.line(createdLine);
  context.out.progress(context.t("cli.run.starting.body", { name: playground.name }));
  const started = await startAndReport(context, {
    playground: playground.id,
    kind: playground.kind,
    owner,
    timeoutSeconds,
    noWait: context.flag("no-wait"),
    restart: false,
    port: undefined,
  });
  announce(context, started);
  const { name: _name, ...run } = started.json;
  context.out.result({ ...base, run }, runLines(context, started));
};
