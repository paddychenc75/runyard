// 工具查找和检测（技术设计 §4.8）：在解析出的环境里按 PATH 找，再用 `--version` 确认。
import { execFile } from "node:child_process";
import { accessSync, constants, readdirSync, statSync } from "node:fs";
import path from "node:path";

export const TOOLS = [
  { id: "node", names: ["node"], args: ["--version"], re: /v?(\d+\.\d+\.\d+)/ },
  { id: "pnpm", names: ["pnpm"], args: ["--version"], re: /(\d+\.\d+\.\d+)/ },
  { id: "python", names: ["python3", "python"], args: ["--version"], re: /Python (\d+\.\d+\.\d+)/ },
  { id: "uv", names: ["uv"], args: ["--version"], re: /uv (\d+\.\d+\.\d+)/ },
  // Go 没有 --version，要用子命令 `go version`：检测脚本必须按工具定义，不能一刀切
  { id: "go", names: ["go"], args: ["version"], re: /go version go(\d+\.\d+(?:\.\d+)?)/ },
];

function isExec(p) {
  try {
    if (!statSync(p).isFile()) return false;
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

// 手写 which：按给定环境的 PATH 找第一个可执行文件（不依赖 process.env.PATH）
export function which(name, env) {
  for (const dir of (env.PATH || "").split(":")) {
    if (!dir) continue;
    const p = path.join(dir, name);
    if (isExec(p)) return p;
  }
  return null;
}

export function runVersion(file, env, cwd, timeoutMs = 4000, args = ["--version"]) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    execFile(file, args, { env, cwd, timeout: timeoutMs, encoding: "utf8", killSignal: "SIGKILL" }, (err, stdout, stderr) => {
      resolve({ out: ((stdout || "") + (stderr || "")).trim().split("\n")[0] ?? "", ok: !err, ms: performance.now() - t0 });
    });
  });
}

// 在给定环境和目录下检测五个工具：{ id: { path, version } | { missing } }
export async function detectAll(env, cwd) {
  const result = {};
  for (const t of TOOLS) {
    let found = null;
    for (const n of t.names) {
      const p = which(n, env);
      if (!p) continue;
      const r = await runVersion(p, env, cwd, 4000, t.args);
      const m = t.re.exec(r.out);
      if (r.ok && m) {
        found = { path: p, version: m[1] };
        break;
      }
      found ??= { path: p, version: null, broken: r.out.slice(0, 80) }; // 找到文件但跑不起来（pyenv 无版本、macOS 的 python3 占位程序）
    }
    result[t.id] = found ?? { missing: true };
  }
  return result;
}

// ---------- 回退：只扫常见目录（不解析 shell） ----------
export function wellKnownDirs(home) {
  const dirs = [
    "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/usr/local/go/bin",
    `${home}/.local/bin`, `${home}/.volta/bin`, `${home}/.cargo/bin`, `${home}/go/bin`, `${home}/.bun/bin`,
    `${home}/.asdf/shims`, `${home}/.pyenv/shims`, `${home}/.local/share/mise/shims`, `${home}/.local/share/fnm/aliases/default/bin`,
  ];
  // nvm / fnm 的版本目录：取版本号最高的一个（不知道用户的默认别名是哪个——这是回退的固有缺陷）
  for (const base of [`${home}/.nvm/versions/node`, `${home}/.fnm/node-versions`, `${home}/Library/Application Support/fnm/node-versions`]) {
    try {
      const vs = readdirSync(base).filter((v) => /^v?\d/.test(v)).sort((a, b) => cmp(b, a));
      for (const v of vs) dirs.push(base.includes("fnm") ? `${base}/${v}/installation/bin` : `${base}/${v}/bin`);
    } catch {}
  }
  return dirs;
}
function cmp(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number), pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}
export function scanFallbackEnv(home, base = {}) {
  return { ...base, HOME: home, PATH: wellKnownDirs(home).join(":") };
}
