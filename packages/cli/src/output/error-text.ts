import type { Localized, Translate } from "@runyard/i18n";
import type { CliError } from "../cli-error.ts";

// 错误码到文案：键 errors.<码>.<字段> 由协议登记表推出，参数类型随码变，所以这里按字符串键调用一次。
type LooseTranslate = (key: string, values: unknown) => Localized;

function errorField(t: Translate, error: CliError, field: "title" | "body" | "hintCli"): Localized {
  return (t as LooseTranslate)(`errors.${error.code}.${field}`, error.params);
}

/**
 * --json 里的 message 与 hint，永远是英文（技术设计 §5.3）：message 是标题，用法错误时换成更具体的说明；
 * hint 取命令行版的提示，里面有完整的下一步命令。
 */
export function englishErrorFields(
  tEnglish: Translate,
  error: CliError,
): { message: Localized; hint: Localized } {
  return {
    message: error.detail ? error.detail(tEnglish) : errorField(tEnglish, error, "title"),
    hint: errorField(tEnglish, error, "hintCli"),
  };
}

/** 给人看的错误：“错误: 标题”、说明、下一步 */
export function humanErrorLines(t: Translate, error: CliError): Localized[] {
  return [
    t("cli.error.title.label", { title: errorField(t, error, "title") }),
    error.detail ? error.detail(t) : errorField(t, error, "body"),
    errorField(t, error, "hintCli"),
  ];
}
