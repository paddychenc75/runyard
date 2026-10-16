import { lintTemplateRef } from "@runyard/core";
import { relativePathSchema, type TemplateRecord, templateIdPattern } from "@runyard/protocol";
import { cliError, usageError } from "../cli-error.ts";
import { templateLocations } from "../templates/template-locations.ts";
import type { CommandContext } from "./command-context.ts";
import type { CommandHandler } from "./command-spec.ts";

// template list | show | save | lint（规格 CLI-COMMANDS“模板命令”、TEMPLATES-CUSTOM、TEMPLATES-FORMAT-42）。
// list、show、save 经管理进程（模板目录由它读写）；lint 在本进程里直接跑，不连管理进程。
// name、description 原样带着模板里的值，--json 不随语言挑选；给人看的行才按当前语言挑。

type Text = TemplateRecord["name"];

function pick(text: Text, locale: CommandContext["locale"]): string {
  return typeof text === "string" ? text : (text[locale] ?? text.en);
}

function recordLine(context: CommandContext, record: TemplateRecord) {
  return context.t("cli.templateList.item.body", {
    id: record.id,
    name: pick(record.name, context.locale),
    source: record.source,
    valid: record.valid ? "yes" : "no",
  });
}

export const templateList: CommandHandler = async (context) => {
  const client = await context.client();
  const templates = await client.call("template.list", {});
  context.out.result(
    { templates },
    templates.map((record) => recordLine(context, record)),
  );
};

export const templateShow: CommandHandler = async (context) => {
  const id = context.positionals[0] ?? "";
  const client = await context.client();
  const detail = await client.call("template.get", { id });
  context.out.result({ template: detail.template, path: detail.path, files: detail.files }, [
    recordLine(context, detail.template),
    context.t("cli.templateShow.path.body", { path: detail.path }),
    ...detail.files.map((file) => context.t("cli.templateShow.file.body", { file })),
  ]);
};

// 相对路径不合法（绝对路径、含 ..）报 USAGE，不发请求（规格 TEMPLATES-CUSTOM-13）
function relativePaths(context: CommandContext, option: "include" | "exclude"): string[] {
  const values = context.values(option);
  for (const value of values) {
    if (!relativePathSchema.safeParse(value).success) {
      throw usageError((t) => t("cli.usage.invalidValue.body", { option, value }));
    }
  }
  return values;
}

export const templateSave: CommandHandler = async (context) => {
  const playground = context.positionals[0] ?? "";
  const as = context.value("as");
  if (as === undefined) {
    throw usageError((t) => t("cli.usage.missingArgument.body", { argument: "--as" }));
  }
  if (!templateIdPattern.test(as)) throw cliError("NAME_INVALID", { name: as });
  const include = relativePaths(context, "include");
  const exclude = relativePaths(context, "exclude");
  const name = context.value("name");
  const description = context.value("description");
  const client = await context.client();
  const saved = await client.call("template.save", {
    playground,
    as,
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(context.flag("replace-name") ? { replaceName: true } : {}),
    ...(include.length > 0 ? { include } : {}),
    ...(exclude.length > 0 ? { exclude } : {}),
  });
  context.out.result({ ...saved }, [
    context.t("cli.templateSave.saved.body", { id: saved.id, path: saved.path }),
  ]);
};

export const templateLint: CommandHandler = async (context) => {
  const ref = context.positionals[0] ?? "";
  const outcome = await lintTemplateRef(
    context.platform,
    templateLocations(context.platform, context.host),
    ref,
  );
  if (outcome.kind === "not-found") throw cliError("TEMPLATE_NOT_FOUND", { template: ref });
  const { result } = outcome;
  const lines = [
    result.ok
      ? context.t("cli.templateLint.ok.body", { template: result.template })
      : context.t("cli.templateLint.failed.body", { template: result.template }),
    ...[...result.errors, ...result.warnings].map((issue) =>
      context.t("cli.templateLint.issue.body", {
        rule: issue.rule,
        path: issue.path === "" ? "template.json" : issue.path,
        message: issue.message,
      }),
    ),
  ];
  context.out.result({ ...result }, lines);
  // 有错误时结果照常输出，退出码取 TEMPLATE_INVALID 的 2（规格 TEMPLATES-FORMAT-38）
  if (!result.ok) throw cliError("TEMPLATE_INVALID", { template: result.template });
};
