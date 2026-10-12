import { isLocale, type Locale } from "./locale.ts";

// 命令行的语言解析（技术设计 §5.3、§6.8，PRD #prd-cli-language）。
// 纯函数：环境变量和 cli.json 由 cli 包读出来再传进来，这里不碰 Node。

export type CliLocaleSource = "flag" | "env" | "saved" | "default";

export interface CliLocaleInput {
  /** `--lang` 的值 */
  flag?: string | undefined;
  /** 环境变量 `RUNYARD_LANG` 的值 */
  env?: string | undefined;
  /** `~/.runyard/cli.json` 里的 `lang` */
  saved?: string | undefined;
}

export interface CliLocaleResolution {
  locale: Locale;
  /** 生效的值来自哪里；都没有时是 default */
  source: CliLocaleSource;
  /** 不认识的值：退回英文，调用方要在标准错误上输出一行提示。认识的值没有这个字段 */
  unsupported?: { source: Exclude<CliLocaleSource, "default">; value: string };
}

// 优先级：flag > env > saved > 英文。空字符串当作没设（shell 里 `RUNYARD_LANG=` 的常见写法）。
// 最高优先级的那个值不认识时直接退回英文，不再往下找：否则 `--lang zh` 的笔误会悄悄变成别处设置的值。
export function resolveCliLocale(input: CliLocaleInput): CliLocaleResolution {
  const candidates = [
    ["flag", input.flag],
    ["env", input.env],
    ["saved", input.saved],
  ] as const;
  for (const [source, value] of candidates) {
    if (value === undefined || value === "") continue;
    if (isLocale(value)) return { locale: value, source };
    return { locale: "en", source, unsupported: { source, value } };
  }
  return { locale: "en", source: "default" };
}
