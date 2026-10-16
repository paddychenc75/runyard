import { type CliLocaleResolution, resolveCliLocale } from "@runyard/i18n";

// 读出 --lang、RUNYARD_LANG、cli.json 里的三个值，交给 i18n 的纯函数。
// 系统语言（LANG 等）不看：默认就是英文（负责人 2026-10-12 决定，PRD #prd-cli-language）。
export function resolveLanguage(input: {
  flag: string | undefined;
  env: Readonly<Record<string, string | undefined>>;
  saved: string | undefined;
}): CliLocaleResolution {
  return resolveCliLocale({ flag: input.flag, env: input.env.RUNYARD_LANG, saved: input.saved });
}
