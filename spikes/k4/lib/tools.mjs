// 找工具的真实路径。Windows 上 pnpm 往往是 .cmd 垫片：Node 不许直接启动，要经 cmd.exe（技术设计 §7.2 第 1 行）。
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { isWin } from "./capture.mjs";

export function which(name) {
  const exts = isWin ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter)) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

/** 返回 { cmd, args, windowsVerbatimArguments }；.cmd 垫片包一层 cmd.exe（本探针里参数都是简单词，不含空格和引号）。 */
export function resolveCommand(name, args) {
  const p = which(name);
  if (!p) return null;
  if (isWin && /\.(cmd|bat)$/i.test(p)) {
    return { cmd: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", `"${p}" ${args.join(" ")}`], windowsVerbatimArguments: true, via: "cmd.exe+shim" };
  }
  return { cmd: p, args, via: "direct" };
}

export function tryRun(cmd, args, windowsVerbatimArguments) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, windowsVerbatimArguments });
  return r.error ? null : (r.stdout + r.stderr).trim();
}

export function toolVersions() {
  const v = {};
  for (const [k, c, a] of [
    ["node", process.execPath, ["-v"]],
    ["python", "python", ["--version"]],
    ["python3", "python3", ["--version"]],
    ["py", "py", ["-3", "--version"]],
    ["uv", "uv", ["--version"]],
    ["go", "go", ["version"]],
    ["pnpm", "pnpm", ["--version"]],
  ]) {
    const full = k === "node" ? c : which(c);
    const r = full && /\.(cmd|bat)$/i.test(full) ? resolveCommand(k, a) : null;
    v[k] = full ? { path: full, version: r ? tryRun(r.cmd, r.args, r.windowsVerbatimArguments) : tryRun(full, a) } : null;
  }
  return v;
}
