// 解析"用户在终端里会拿到的环境"（技术设计 §7.1 env.load 的 macOS 实现原型）。
// 纯 Node，不用原生模块。做法：启动用户的登录 shell（登录 + 交互），让它在两个唯一标记之间
// 用 `env -0` 打印整个环境，我们只解析标记之间的字节。
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------- 1. 找登录 shell ----------
// 从 Finder 启动的应用里 SHELL 可能不存在，且 SHELL 反映的是"启动方"而不是用户的设置，
// 所以先问系统账户库（getpwuid，等价于 dscl 的 UserShell），再退回 dscl，最后才看环境变量。
export function findLoginShell(env = process.env) {
  const tries = [];
  try {
    const s = os.userInfo().shell;
    if (s) tries.push(["os.userInfo", s]);
  } catch {}
  if (process.platform === "darwin") {
    try {
      const user = env.USER || os.userInfo().username;
      const out = execFileSync("/usr/bin/dscl", [".", "-read", `/Users/${user}`, "UserShell"], {
        encoding: "utf8",
        timeout: 1500,
      });
      const m = /UserShell:\s*(\S+)/.exec(out);
      if (m) tries.push(["dscl", m[1]]);
    } catch {}
  }
  if (env.SHELL) tries.push(["env.SHELL", env.SHELL]);
  tries.push(["default", process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"]);
  for (const [via, p] of tries) {
    try {
      if (statSync(p).isFile()) return { shell: p, via };
    } catch {}
  }
  return { shell: "/bin/sh", via: "last-resort" };
}

export function shellKind(shellPath) {
  const b = path.basename(shellPath);
  if (b === "zsh" || b === "bash" || b === "fish") return b;
  if (b === "sh" || b === "dash" || b === "ksh") return "posix";
  return "unknown"; // nu、xonsh、tcsh 等：不支持，直接走回退
}

// ---------- 2. 拼要在 shell 里执行的命令 ----------
// bash/zsh/fish 对"简单命令 + 分号"的语法一致，所以三种 shell 共用 dump 部分；
// warmup 和 hooks 两段语法不同，分开写。
const TOOL_NAMES = ["node", "npm", "pnpm", "python3", "python", "uv", "go"];

function warmupSnippet(kind) {
  if (kind === "fish") {
    // fish：懒加载的 node 是函数；调用一次让它把真实路径放进 PATH
    return `for __t in ${TOOL_NAMES.join(" ")}; if functions -q $__t; $__t --version </dev/null >/dev/null 2>&1; end; end; `;
  }
  // command -v 对函数/别名返回不含斜杠的名字（懒加载 nvm 的特征），此时调用一次触发加载
  return `for __t in ${TOOL_NAMES.join(" ")}; do __p=$(command -v "$__t" 2>/dev/null); case "$__p" in /*|'') ;; *) "$__t" --version </dev/null >/dev/null 2>&1;; esac; done; `;
}

function hooksSnippet(kind) {
  if (kind === "fish") return `emit fish_prompt 2>/dev/null; `;
  // 交互 shell 只在画提示符前才跑 precmd / PROMPT_COMMAND（mise activate 等靠它改 PATH），
  // `-c` 里没有提示符，所以手动跑一遍
  return (
    `if [ -n "$ZSH_VERSION" ]; then for __f in "\${precmd_functions[@]}"; do "$__f" 2>/dev/null; done; fi; ` +
    `if [ -n "$BASH_VERSION" ]; then for __c in "\${PROMPT_COMMAND[@]}"; do eval "$__c" 2>/dev/null; done; fi; `
  );
}

export function buildCommand(kind, nonce, opts = {}) {
  const start = `__RUNYARD_ENV_${nonce}_START__`;
  const end = `__RUNYARD_ENV_${nonce}_END__`;
  let cmd = "";
  if (opts.hooks !== false) cmd += hooksSnippet(kind);
  if (opts.warmup !== false) cmd += warmupSnippet(kind);
  // 绝对路径的 env：避免用户把 env 定义成函数/别名；-0 用 NUL 分隔，值里有换行也不会乱
  cmd += `printf '%s' '${start}'; /usr/bin/env -0; printf '%s' '${end}'`;
  return { cmd, start, end };
}

// ---------- 3. 解析 ----------
export function parseEnvDump(buf, start, end) {
  const s = buf.indexOf(start);
  if (s < 0) return { ok: false, reason: "NO_START_MARKER" };
  const bodyStart = s + start.length;
  const e = buf.indexOf(end, bodyStart);
  if (e < 0) return { ok: false, reason: "NO_END_MARKER" };
  const env = {};
  let lossy = false;
  for (const entry of buf.subarray(bodyStart, e).toString("latin1").split("\0")) {
    // 先按 latin1 切开再按 utf8 还原，保证只有真正的非法字节才被替换
    if (!entry) continue;
    const i = entry.indexOf("=");
    if (i <= 0) continue;
    const k = Buffer.from(entry.slice(0, i), "latin1").toString("utf8");
    const v = Buffer.from(entry.slice(i + 1), "latin1").toString("utf8");
    if (v.includes("�")) lossy = true;
    env[k] = v;
  }
  const noiseBytes = s + (buf.length - (e + end.length));
  return { ok: true, env, lossy, noiseBytes };
}

// ---------- 4. 运行 ----------
// baseEnv：给 shell 的初始环境（Finder 里是极简的）。shellArgs：['-l','-i','-c'] 或 ['-l','-c']。
export function captureOnce({ shell, kind, cwd, baseEnv, timeoutMs = 10000, interactive = true, earlyExit = true, hooks, warmup, viaStdin = false }) {
  const nonce = randomBytes(8).toString("hex");
  const { cmd, start, end } = buildCommand(kind, nonce, { hooks, warmup });
  // viaStdin：命令不放在 -c 里而是写进 stdin。rc 里 `exec 另一个 shell` 会吞掉 -c 的命令，
  // 但新 shell 继承了 stdin，所以还能执行。代价：rc 里的 read 会把这行命令吃掉，所以只作第二次尝试。
  const args = viaStdin ? ["-l", "-i"] : ["-l", ...(interactive ? ["-i"] : []), "-c", cmd];
  const t0 = performance.now();
  return new Promise((resolve) => {
    const chunks = [];
    let total = 0;
    let errTail = "";
    let done = false;
    let timedOut = false;
    let child;
    const finish = (extra) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const ms = performance.now() - t0;
      const buf = Buffer.concat(chunks);
      const parsed = parseEnvDump(buf, start, end);
      resolve({ ms, shell, kind, interactive, timedOut, stdoutBytes: buf.length, stderrTail: errTail.slice(-400), ...extra, ...(parsed.ok ? parsed : { ok: false, reason: timedOut ? "TIMEOUT" : parsed.reason }) });
    };
    // 杀进程组：detached 让子进程自成一组（也等于没有控制终端，和 Finder 启动的情形一致）。
    // 只杀我们自己启动的这个组。
    const killGroup = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
      setTimeout(() => finish({ exitCode: null, signal: "SIGKILL" }), 300);
    }, timeoutMs);
    try {
      child = spawn(shell, args, { cwd, env: baseEnv, stdio: [viaStdin ? "pipe" : "ignore", "pipe", "pipe"], detached: true });
      if (viaStdin) { child.stdin.on("error", () => {}); child.stdin.end(cmd + "\nexit\n"); }
    } catch (e) {
      return finish({ ok: false, reason: "SPAWN_ERROR", error: String(e) });
    }
    child.on("error", (e) => finish({ ok: false, reason: "SPAWN_ERROR", error: String(e) }));
    child.stdout.on("data", (d) => {
      total += d.length;
      if (total > 64 * 1024 * 1024) return killGroup(); // 防失控输出
      chunks.push(d);
      // 看到结束标记就不用等 shell 慢慢退出（zshexit、历史文件、.zlogout 都可能很慢）
      if (earlyExit && d.includes(end)) {
        const buf = Buffer.concat(chunks);
        if (buf.indexOf(end, buf.indexOf(start)) >= 0) {
          killGroup();
          finish({ exitCode: null, signal: "early" });
        }
      }
    });
    child.stderr.on("data", (d) => {
      errTail = (errTail + d.toString("latin1")).slice(-2000);
    });
    child.on("close", (code, signal) => finish({ exitCode: code, signal }));
  });
}

// 完整流程：登录+交互 → （若 shell 提前退出且没有标记，例如 .zshrc 里 exec 了别的 shell）登录非交互 → 失败。
export async function resolveLoginEnv({ baseEnv = process.env, cwd = os.homedir(), shell, timeoutMs = 10000, strategy = "full", ...rest } = {}) {
  const found = shell ? { shell, via: "given" } : findLoginShell(baseEnv);
  const kind = shellKind(found.shell);
  if (kind === "unknown") return { ok: false, reason: "UNSUPPORTED_SHELL", shell: found.shell, via: found.via, ms: 0 };
  const env = { ...baseEnv, RUNYARD_RESOLVING_ENV: "1" }; // 让用户的启动文件能识别并跳过交互类内容
  // strategy 只用于消融实验：interactive-only = 只试 -l -i；noninteractive-only = 只试 -l（不读 .zshrc）
  const a = await captureOnce({ shell: found.shell, kind, cwd, baseEnv: env, timeoutMs, interactive: strategy !== "noninteractive-only", ...rest });
  a.shellVia = found.via;
  if (a.ok || a.timedOut || strategy !== "full") return a;
  // 第二次机会：命令走 stdin（能穿过 rc 里的 exec）
  const s2 = await captureOnce({ shell: found.shell, kind, cwd, baseEnv: env, timeoutMs: Math.min(timeoutMs, 4000), interactive: true, viaStdin: true, hooks: false, warmup: false, ...rest });
  s2.shellVia = found.via; s2.via = "stdin"; s2.firstAttempt = { reason: a.reason, ms: a.ms }; s2.ms += a.ms;
  if (s2.ok) { s2.degraded = false; return s2; }
  // 第三次机会：只读 profile 类文件，拿不到 .zshrc 里的内容，但比什么都没有好
  const b = await captureOnce({ shell: found.shell, kind, cwd, baseEnv: env, timeoutMs: Math.min(timeoutMs, 4000), interactive: false, ...rest });
  b.shellVia = found.via;
  b.firstAttempt = { reason: a.reason, ms: a.ms };
  b.degraded = b.ok; // 非交互：缺 .zshrc 里设置的内容
  b.ms += a.ms;
  return b;
}

// ---------- 5. 缓存 ----------
// 键：登录 shell + 启动文件的 mtime。PATH 里的目录内容变化不用失效（which 总是实时查）。
export function dotfilesFor(kind, home, env = {}) {
  const zd = env.ZDOTDIR || home;
  const files = {
    zsh: ["/etc/zshenv", "/etc/zprofile", "/etc/zshrc", "/etc/zlogin", ...[".zshenv", ".zprofile", ".zshrc", ".zlogin"].map((f) => path.join(zd, f))],
    bash: ["/etc/profile", ...[".bash_profile", ".bash_login", ".profile", ".bashrc"].map((f) => path.join(home, f))],
    fish: ["/etc/fish/config.fish", path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "fish/config.fish")],
  }[kind] ?? [];
  return files;
}
export function dotfileStamp(kind, home, env) {
  return dotfilesFor(kind, home, env).map((f) => {
    try {
      return `${f}:${statSync(f).mtimeMs}`;
    } catch {
      return `${f}:-`;
    }
  }).join("|");
}
