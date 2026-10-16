import { isLocale, type Locale } from "@runyard/i18n";

// 开发时的启动参数和环境变量。用法：pnpm dev [--root <目录>] [--lang en|zh-CN]
// 不认识的参数原样忽略（Chromium 自己也会收到一些）。

export interface DesktopArgs {
  /** 代替主目录：状态目录是 <root>/.runyard，资源库是 <root>/Runyard（与命令行的 --root 一致）；缺省用真实主目录 */
  root: string | undefined;
  lang: Locale | undefined;
  /** 冒烟自检：窗口不显示，走一遍“运行再预览”后自己退出 */
  smoke: boolean;
}

export type ParsedArgs = { ok: true; args: DesktopArgs } | { ok: false; problem: string };

function takeValue(argv: readonly string[], name: string): string | undefined | "missing" {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? "missing" : value;
}

export function parseDesktopArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): ParsedArgs {
  const root = takeValue(argv, "--root") ?? env.RUNYARD_ROOT;
  if (root === "missing") return { ok: false, problem: "--root needs a directory" };
  const lang = takeValue(argv, "--lang") ?? env.RUNYARD_LANG;
  if (lang === "missing") return { ok: false, problem: "--lang needs en or zh-CN" };
  if (lang !== undefined && !isLocale(lang)) {
    return { ok: false, problem: `unsupported language ${lang}` };
  }
  return {
    ok: true,
    args: {
      root: root === undefined || root === "" ? undefined : root,
      lang: lang === undefined ? undefined : lang,
      smoke: argv.includes("--smoke"),
    },
  };
}

/** 语言：参数或环境变量指定的优先；否则看系统语言列表，中文系统用中文，其余用英文 */
export function resolveDesktopLocale(
  chosen: Locale | undefined,
  systemLanguages: readonly string[],
): Locale {
  if (chosen !== undefined) return chosen;
  const first = systemLanguages[0] ?? "";
  return first.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}
