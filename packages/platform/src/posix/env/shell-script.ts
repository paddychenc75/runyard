import type { ShellKind } from "./login-shell.ts";

// 交给登录 shell 执行的脚本：钩子、预热、在随机标记之间打印环境（决策记录 0009 的依据文档“解析器算法”）。
// 标记在脚本里拆成两段再拼，这样脚本文本本身（被回显、出现在报错里）永远不含完整的标记。

/** 预热：这些工具在 `command -v` 里是函数名（懒加载的 nvm）就调用一次，让它把真正的 PATH 装进当前 shell */
export const WARM_UP_TOOLS = ["node", "npm", "pnpm", "python3", "python", "uv", "go"] as const;

export interface Markers {
  readonly start: string;
  readonly end: string;
}

export function markersFor(nonce: string): Markers {
  return { start: `__RUNYARD_ENV_${nonce}_START__`, end: `__RUNYARD_ENV_${nonce}_END__` };
}

export type CaptureMode = "env" | "path";

const TOOLS = WARM_UP_TOOLS.join(" ");

// 先 set +u +e：用户的启动文件可能开着 nounset 或 errexit，我们的命令不该因此半路退出
const PRELUDE = "set +u +e 2>/dev/null";

// 手动跑 precmd：mise activate 这类钩子只在提示符之前改 PATH。钩子在当前 shell 里跑，输出丢掉
// 脚本是 shell 代码，其中的 `${…}` 不是模板占位符
const ARRAY = (name: string) => `"$\{${name}[@]}"`;
const ZSH_HOOK = `{ for __ry_f in precmd ${ARRAY("precmd_functions")}; do typeset -f "$__ry_f" >/dev/null 2>&1 && "$__ry_f" >/dev/null 2>&1; done; } 2>/dev/null`;
const BASH_HOOK = `{ for __ry_f in ${ARRAY("PROMPT_COMMAND")}; do eval "$__ry_f" >/dev/null 2>&1; done; } 2>/dev/null`;

function posixWarmUp(): string {
  return `for __ry_t in ${TOOLS}; do __ry_p=$(command -v "$__ry_t" 2>/dev/null); case "$__ry_p" in /*|'') ;; *) if [ "$__ry_t" = go ]; then go version; else "$__ry_t" --version; fi </dev/null >/dev/null 2>&1;; esac; done`;
}

function fishWarmUp(): string {
  return `for t in ${TOOLS}; if functions -q $t; if test $t = go; go version; else; $t --version; end </dev/null >/dev/null 2>&1; end; end`;
}

function split(marker: string): [string, string] {
  const cut = marker.length - 6;
  return [marker.slice(0, cut), marker.slice(cut)];
}

function printMarker(marker: string): string {
  const [head, tail] = split(marker);
  return `printf '%s%s' '${head}' '${tail}'`;
}

function printBody(kind: ShellKind, mode: CaptureMode): string {
  if (mode === "env") return "/usr/bin/env -0";
  // 只用内建打印 PATH：单个环境变量超过 128 KB 时 env 无法被执行
  return kind === "fish"
    ? "printf 'PATH=%s\\0' (string join : $PATH)"
    : "printf 'PATH=%s\\0' \"$PATH\"";
}

/** 一整条命令（单行）。`mode: "path"` 是 env 无法执行时的备用 */
export function captureScript(kind: ShellKind, markers: Markers, mode: CaptureMode): string {
  const body = printBody(kind, mode);
  const print = `${printMarker(markers.start)}; ${body}; ${printMarker(markers.end)}`;
  if (kind === "fish") {
    return `emit fish_prompt 2>/dev/null; ${fishWarmUp()}; ${print}`;
  }
  const hook = kind === "zsh" ? ZSH_HOOK : BASH_HOOK;
  return [PRELUDE, hook, posixWarmUp(), print].join("; ");
}
