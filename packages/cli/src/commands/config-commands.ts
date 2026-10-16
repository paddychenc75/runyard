import { cliLocaleSchema } from "@runyard/protocol";
import { usageError } from "../cli-error.ts";
import type { CommandHandler } from "./command-spec.ts";

// config get lang / config set lang <locale>：命令行唯一的设置项（规格 CLI-COMMANDS-17 到 19）。
// 不连管理进程。

const SETTING = "lang";

function requireLang(key: string | undefined): void {
  if (key !== SETTING) {
    const name = key ?? "";
    throw usageError((t) => t("cli.usage.unknownSetting.body", { name }));
  }
}

export const configGet: CommandHandler = async (context) => {
  requireLang(context.positionals[0]);
  const { locale: lang, source } = context.language;
  context.out.result({ lang, source }, [context.t("cli.config.getLang.body", { lang, source })]);
};

export const configSet: CommandHandler = async (context) => {
  requireLang(context.positionals[0]);
  const value = context.positionals[1] ?? "";
  const parsed = cliLocaleSchema.safeParse(value);
  if (!parsed.success) {
    throw usageError((t) => t("cli.usage.invalidValue.body", { option: SETTING, value }));
  }
  await context.settings.setLang(parsed.data);
  context.out.result({ lang: parsed.data }, [
    context.t("cli.config.setLang.body", { lang: parsed.data }),
  ]);
};
