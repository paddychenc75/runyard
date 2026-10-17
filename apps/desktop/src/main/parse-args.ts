import { isLocale, type Locale } from "@runyard/i18n";

// 启动参数和环境变量。用法：pnpm dev [--root <目录>] [--lang en|zh-CN] [--theme system|light|dark]
// 另有 --install-cli / --uninstall-cli [--cli-bin-dir <目录>]：命令行接到 PATH 或撤掉（打包后的应用）
// 不认识的参数原样忽略（Chromium 自己也会收到一些）。

export interface DesktopArgs {
  /** 代替主目录：状态目录是 <root>/.runyard，资源库是 <root>/Runyard（与命令行的 --root 一致）；缺省用真实主目录 */
  root: string | undefined;
  lang: Locale | undefined;
  /** 窗口的明暗：跟随系统、浅色、深色；缺省跟随系统。设置页的主题选项随后续 PR，现在只能这样指定 */
  theme: ThemeChoice | undefined;
  /** 冒烟自检：窗口不显示，走一遍“运行再预览”后自己退出 */
  smoke: boolean;
  /** 编辑器冒烟：打开不带管理进程的冒烟页，检查 Monaco、后台线程、Shiki 在新内容安全策略下都起得来，做完自己退出 */
  editorSmoke: boolean;
  /** 把随应用安装的 runyard 接到 PATH 上或撤掉，做完就退出、不开窗口；设置页里的按钮随后续 issue */
  cliLink: { action: "install" | "uninstall"; binDir: string | undefined } | undefined;
}

/**
 * 用户给的参数。源码运行（electron dist/main/index.mjs）时 argv 是 [electron, 脚本, ...参数]，
 * 打好的包里是 [可执行文件, ...参数]，没有脚本这一项：按 2 切会把包里的第一个参数（如 --root）吞掉。
 */
export function userArgv(argv: readonly string[], defaultApp: boolean | undefined): string[] {
  return argv.slice(defaultApp === true ? 2 : 1);
}

export type ThemeChoice = "system" | "light" | "dark";

export function isThemeChoice(value: string): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
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
  const theme = takeValue(argv, "--theme") ?? env.RUNYARD_THEME;
  if (theme === "missing") return { ok: false, problem: "--theme needs system, light or dark" };
  if (theme !== undefined && !isThemeChoice(theme)) {
    return { ok: false, problem: `unsupported theme ${theme}` };
  }
  const binDir = takeValue(argv, "--cli-bin-dir");
  if (binDir === "missing") return { ok: false, problem: "--cli-bin-dir needs a directory" };
  const install = argv.includes("--install-cli");
  if (install && argv.includes("--uninstall-cli")) {
    return { ok: false, problem: "--install-cli and --uninstall-cli cannot be combined" };
  }
  return {
    ok: true,
    args: {
      cliLink:
        install || argv.includes("--uninstall-cli")
          ? { action: install ? "install" : "uninstall", binDir }
          : undefined,
      root: root === undefined || root === "" ? undefined : root,
      lang: lang === undefined ? undefined : lang,
      theme,
      smoke: argv.includes("--smoke"),
      editorSmoke: argv.includes("--editor-smoke"),
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
