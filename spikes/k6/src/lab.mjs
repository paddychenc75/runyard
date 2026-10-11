// 实验台：在临时目录里造"假家目录"，同时跑"终端用户视角"（对照）和解析器，比较。
// 绝不碰真实的 ~/.zshrc 等：每个沙箱用独立 HOME（ZDOTDIR、XDG_CONFIG_HOME 都不设，跟着 HOME 走）。
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLoginEnv } from "./resolve-env.mjs";
import { TOOLS, detectAll, scanFallbackEnv } from "./tools.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SANDBOX_ROOT = mkdtempSync(path.join(os.tmpdir(), "runyard-k6-"));
process.on("exit", () => cleanup());
export function cleanup() {
  // 只删我们自己创建的根目录
  try {
    rmSync(SANDBOX_ROOT, { recursive: true, force: true });
  } catch {}
}

export const SHELLS = {
  zsh: ["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh"],
  bash: ["/bin/bash", "/usr/bin/bash"],
  fish: ["/opt/homebrew/bin/fish", "/usr/local/bin/fish", "/usr/bin/fish", "/bin/fish"],
};
export function shellPath(kind) {
  return SHELLS[kind].find((p) => existsSync(p)) ?? null;
}

// 像 launchd 给图形应用的那种极简环境
export function finderEnv(home) {
  return { HOME: home, USER: "k6user", LOGNAME: "k6user", PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: os.tmpdir() + "/", LANG: "en_US.UTF-8" };
}
// 终端里看到的初始环境：多了 TERM、SHELL
function terminalEnv(home, shell) {
  return { ...finderEnv(home), TERM: "xterm-256color", SHELL: shell };
}

// ---------- 沙箱 ----------
export function makeSandbox(name, kind) {
  const root = path.join(SANDBOX_ROOT, `${name}-${kind}`);
  const home = path.join(root, "home");
  mkdirSync(home, { recursive: true });
  const slots = { env: [], profile: [], rc: [] };
  const w = (rel, content, mode) => {
    const f = path.join(home, rel);
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, content);
    if (mode) chmodSync(f, mode);
    return f;
  };
  const ctx = {
    kind, home, root,
    write: w,
    exe: (rel, body) => w(rel, `#!/bin/sh\n${body}\n`, 0o755),
    // 打印固定一行的假工具
    tool: (rel, out) => ctx.exe(rel, `echo "${out}"`),
    // 模拟 asdf / pyenv / mise / volta 的 shim：按当前目录向上找版本文件决定版本
    shim: (rel, { file, sed, dflt, fmt }) =>
      ctx.exe(rel, `d="$PWD"; v=""\nwhile :; do\n  if [ -f "$d/${file}" ]; then v=$(sed -n '${sed}' "$d/${file}" | head -1); [ -n "$v" ] && break; fi\n  [ "$d" = "/" ] && break; d=$(dirname "$d")\ndone\n[ -z "$v" ] && v="${dflt}"\necho "${fmt}" | sed "s/@V@/$v/"`),
    project: path.join(home, "proj"),
    // 往启动文件里加内容。text 可以是字符串（bash/zsh 通用的 POSIX 写法）或 {posix, fish}
    add(slot, text) {
      const t = typeof text === "string" ? { posix: text, fish: text } : text;
      slots[slot].push(kind === "fish" ? t.fish : t.posix);
    },
  };
  mkdirSync(ctx.project, { recursive: true });
  ctx._finish = () => {
    const j = (a) => a.filter(Boolean).join("\n") + "\n";
    if (kind === "zsh") {
      w(".zshenv", j(slots.env));
      w(".zprofile", j(slots.profile));
      w(".zshrc", j(slots.rc));
    } else if (kind === "bash") {
      // 典型的 bash 用户：.bash_profile 里再 source .bashrc
      w(".bash_profile", j([...slots.env, ...slots.profile, '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"']));
      w(".bashrc", j([...slots.rc]));
    } else {
      w(".config/fish/config.fish", j([...slots.env, ...slots.profile, ...slots.rc]));
    }
  };
  return ctx;
}

import { findLoginShell } from "./resolve-env.mjs";
const findLoginShellPath = () => findLoginShell().shell;
// ---------- 对照：终端用户视角 ----------
function gtScript(kind) {
  const names = [["node", "--version"], ["pnpm", "--version"], ["python3", "--version"], ["python", "--version"], ["uv", "--version"], ["go", "version"]];
  if (kind === "fish") {
    return [
      `function __gt; set p (type -p $argv[1] 2>/dev/null); if test -z "$p"; and functions -q $argv[1]; set p $argv[1]; end; set v ""; if test -n "$p"; set v ($argv[1] $argv[2] 2>&1 </dev/null | head -1); end; printf '@@GT|%s|%s|%s\\n' $argv[1] "$p" "$v"; end`,
      ...names.map(([n, a]) => `__gt ${n} ${a}`),
    ].join("\n");
  }
  return [
    `__gt(){ p=$(command -v "$1" 2>/dev/null); v=""; [ -n "$p" ] && v=$("$1" $2 2>&1 </dev/null | head -1); printf '@@GT|%s|%s|%s\\n' "$1" "$p" "$v"; }`,
    ...names.map(([n, a]) => `__gt ${n} ${a}`),
  ].join("\n");
}
export function groundTruth(kind, home, cwd, timeoutS = 25, opt = {}) {
  const shell = opt.real ? findLoginShellPath() : shellPath(kind);
  const r = spawnSync("/usr/bin/python3", [path.join(HERE, "pty-run.py"), cwd, String(timeoutS), shell, "-l"], {
    input: gtScript(kind), env: opt.real ? { HOME: home, USER: opt.USER, LOGNAME: opt.USER, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TERM: "xterm-256color", SHELL: shell, LANG: "en_US.UTF-8" } : terminalEnv(home, shell), // 注意：这个环境会原样传给 shell，所以必须是"终端会给的"极简环境
    timeout: (timeoutS + 10) * 1000,
  });
  const text = r.stdout.toString("utf8");
  const res = {};
  for (const line of text.split(/\r?\n/)) {
    // 终端标题等 OSC 序列会贴在输出行前面，先剥掉再匹配
    const clean = line.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    const m = /@@GT\|([a-z0-9]+)\|([^|]*)\|(.*)$/.exec(clean);
    if (m) res[m[1]] = { path: m[2], out: m[3] };
  }
  return res;
}
// 把对照结果折成和 detectAll 一样的形状（python3/python 按 TOOLS 里的顺序取第一个能用的）
export function gtToTools(gt) {
  const out = {};
  for (const t of TOOLS) {
    out[t.id] = { missing: true };
    for (const n of t.names) {
      const g = gt[n];
      if (!g || !g.path) continue;
      const m = t.re.exec(g.out || "");
      if (m) { out[t.id] = { path: g.path, version: m[1], fn: !g.path.startsWith("/") }; break; }
      if (out[t.id].missing) out[t.id] = { path: g.path, version: null, broken: (g.out || "").slice(0, 80), fn: !g.path.startsWith("/") };
    }
  }
  return out;
}

const rp = (p) => { try { return realpathSync(p); } catch { return p; } };
export function compareTool(gt, got) {
  if (gt.missing && got.missing) return "both-missing";
  if (gt.missing) return "extra"; // 解析器找到了终端里没有的
  if (got.missing) return gt.fn ? "miss(fn)" : "miss";
  if (gt.version !== got.version) return "WRONG-version";
  if (gt.fn) return "same-version(fn)"; // 终端里是 shell 函数，无法比路径
  return gt.path === got.path ? "same" : rp(gt.path) === rp(got.path) ? "same(real)" : "same-version-other-path";
}
export function compareAll(gt, got) {
  const r = {};
  for (const t of TOOLS) r[t.id] = compareTool(gt[t.id], got[t.id]);
  return r;
}
export const isGood = (s) => ["same", "same(real)", "same-version(fn)", "both-missing"].includes(s);

// 绝大多数 Mac 用户的 .zprofile 里都有 brew shellenv；沙箱里也放一份，否则扫描回退会因为多找到 /opt/homebrew 里的 python 而"出错"
export function addBrew(ctx) {
  if (!existsSync("/opt/homebrew/bin/brew")) return;
  ctx.add("profile", { posix: 'eval "$(/opt/homebrew/bin/brew shellenv)"', fish: "/opt/homebrew/bin/brew shellenv | source" });
}

// ---------- 跑一个用例 ----------
// 返回：对照、朴素（不解析，直接用 Finder 的 PATH）、解析器、扫描回退 四组结果及比较
export async function runCase(def, kind, { cwdMode = "home", captureCwdMode = cwdMode, timeoutMs = 10000, resolveOpts = {} } = {}) {
  const shell = shellPath(kind);
  if (!shell) return { skipped: `no ${kind}` };
  if (def.only && !def.only.includes(kind)) return { skipped: "not applicable" };
  if (def.when && !def.when()) return { skipped: "precondition" };
  const ctx = makeSandbox(def.id, kind);
  const fish = kind === "fish";
  if (!def.noBrew) addBrew(ctx);
  def.setup(ctx);
  def.project?.(ctx);
  ctx._finish();
  const cwd = cwdMode === "project" ? ctx.project : ctx.home; // 检测命令（--version）和对照的目录
  const captureCwd = captureCwdMode === "project" ? ctx.project : ctx.home; // 向登录 shell 要环境时的目录
  const gt = gtToTools(groundTruth(kind, ctx.home, cwd));
  const base = finderEnv(ctx.home);
  const naive = await detectAll(base, cwd);
  const res = await resolveLoginEnv({ baseEnv: base, cwd: captureCwd, shell, timeoutMs, ...resolveOpts });
  const resolved = res.ok ? await detectAll(res.env, cwd) : null;
  const scan = await detectAll(scanFallbackEnv(ctx.home, base), cwd);
  const { env, ...meta } = res;
  return {
    case: def.id, kind, cwdMode, captureCwdMode, meta,
    gt, naive: compareAll(gt, naive), resolver: resolved ? compareAll(gt, resolved) : "RESOLVE-FAILED", scan: compareAll(gt, scan),
    detail: { gt, resolved, scan },
    pathResolved: env?.PATH, fish, ctx, setupErrors: ctx.setupErrors,
  };
}
