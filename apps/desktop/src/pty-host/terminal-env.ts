import { basename } from "node:path";

// 终端里 shell 的启动方式和环境（规格 DESKTOP-TERMINAL-07 至 10）。纯函数，不碰系统，单独测。

const DEFAULT_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
const UTF8_LOCALE = "en_US.UTF-8";

function isUtf8(locale: string | undefined): boolean {
  return locale !== undefined && /utf-?8/i.test(locale);
}

export interface TerminalEnvInputs {
  /** pty-host 自己的环境（从访达启动时很短，没有 SHELL，PATH 也不全） */
  base: Readonly<Record<string, string | undefined>>;
  /** 主进程叠加的变量 */
  extra: Readonly<Record<string, string>>;
  /** 实际要运行的 shell */
  shell: string;
  /** 随应用安装的 runyard 启动脚本所在目录；开发时源码里没有，不加 */
  runyardBinDir: string | undefined;
}

/**
 * 终端里的环境。应用自己的环境只当起点：去掉 Electron 的变量（尤其 ELECTRON_RUN_AS_NODE，
 * 否则终端里的 node 会当成 Electron），其余交给登录 shell 的启动文件补全（PATH 里的 nvm 等）。
 * runyard 的目录放在 PATH 最前面，用户没把命令行装进系统也能用（DESKTOP-TERMINAL-09）。
 */
export function buildTerminalEnv(input: TerminalEnvInputs): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...input.base, ...input.extra })) {
    if (value === undefined || key.startsWith("ELECTRON_")) continue;
    env[key] = value;
  }
  env.SHELL = input.shell;
  // 声明 256 色和真彩色（规格“用用户的登录 shell 和真实环境”）
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.TERM_PROGRAM = "Runyard";
  // 按 UTF-8 收发：访达启动的应用没有语言变量；LC_ALL 若指向非 UTF-8 的就去掉，它会盖过 LANG
  if (!isUtf8(env.LANG)) env.LANG = UTF8_LOCALE;
  if (env.LC_ALL !== undefined && !isUtf8(env.LC_ALL)) delete env.LC_ALL;
  const path = env.PATH === undefined || env.PATH === "" ? DEFAULT_PATH : env.PATH;
  env.PATH = input.runyardBinDir === undefined ? path : `${input.runyardBinDir}:${path}`;
  return env;
}

/**
 * 以登录方式运行 shell 的命令行。登录 shell 的标志是进程名（argv[0]）以 `-` 开头，
 * 所以 `$0` 是 `-zsh`（规格 DESKTOP-TERMINAL-07）；`zsh -l` 做不到这一点（`$0` 仍是 zsh）。
 * node-pty 不让设 argv[0]，所以借 bash 的 `exec -a` 换一个名字再执行真正的 shell。
 * 系统的 login 命令也能做到，但它会把工作目录改回家目录，项目文件夹就丢了。
 */
export function loginShellCommand(shell: string): { file: string; args: string[] } {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: 这是交给 bash 的脚本，${0##*/} 由 bash 展开，不是 JavaScript 的模板
  return { file: "/bin/bash", args: ["-c", 'exec -a "-${0##*/}" "$0"', shell] };
}

/** 前台进程名是不是 shell 自己（空闲在提示符）：登录 shell 的名字可能带 `-` 前缀 */
export function isIdleForeground(processName: string, shell: string): boolean {
  const clean = (name: string): string => basename(name).replace(/^-/, "");
  return clean(processName) === clean(shell);
}
