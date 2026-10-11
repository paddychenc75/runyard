// 只在 CI 的一次性机器上跑：真的安装版本管理器，验证 cases.mjs 里"假的"行为和真的一致。
// （本机不装任何东西。这个文件在本机运行会因为找不到 brew 里的管理器而跳过。）
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readlinkSync } from "node:fs";
import os from "node:os";
import { runCase, shellPath } from "./lab.mjs";
import { isGood } from "./lab.mjs";
import { runVersion } from "./tools.mjs";

const BREW = "/opt/homebrew/bin";
const have = (b) => existsSync(`${BREW}/${b}`) || existsSync(`/usr/local/bin/${b}`);

// 在沙箱 HOME 里跑安装脚本（真实安装；失败只记录，不抛）
function run(c, script, timeout = 900000) {
  const r = spawnSync("/bin/bash", ["-c", script], { cwd: c.home, env: { HOME: c.home, USER: "k6user", PATH: `${BREW}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`, TERM: "dumb", NVM_DIR: `${c.home}/.nvm`, CI: "1" }, encoding: "utf8", timeout });
  if (r.status !== 0) (c.setupErrors ??= []).push(`${script.slice(0, 60)} → ${r.status} ${String(r.stderr).slice(-200)}`);
  return r;
}
const P = (posix, fish) => ({ posix, fish });
const sh = (c) => c.kind; // zsh | bash | fish

export const REAL = [
  { id: "real-nvm", when: () => have("brew") && existsSync(`${BREW}/../opt/nvm/nvm.sh`), only: ["zsh", "bash"],
    setup(c) {
      run(c, `mkdir -p $NVM_DIR && . ${BREW}/../opt/nvm/nvm.sh && nvm install 22 >/dev/null 2>&1 && nvm alias default 22 >/dev/null && nvm install 20 >/dev/null 2>&1`);
      c.add("rc", `export NVM_DIR="$HOME/.nvm"\n[ -s "${BREW}/../opt/nvm/nvm.sh" ] && . "${BREW}/../opt/nvm/nvm.sh"`);
    }, project(c) { c.write("proj/.nvmrc", "20\n"); } },
  { id: "real-fnm", when: () => have("fnm"), only: ["zsh", "bash", "fish"],
    setup(c) {
      run(c, `fnm install 22 && fnm default 22 && fnm install 20`);
      c.add("rc", P(`eval "$(fnm env --use-on-cd --shell ${sh(c)})"`, "fnm env --use-on-cd --shell fish | source"));
    }, project(c) { c.write("proj/.node-version", "20\n"); },
    // 验证"per-shell multishell 软链接会过期"：解析器杀掉 shell 之后，PATH 里那个目录还在吗？
    post(c, res) {
      const m = /([^:]*fnm_multishells[^:]*)\/bin/.exec(res.pathResolved ?? "");
      return { multishellInPath: m?.[1]?.replace(c.home, "~"), existsAfterShellKilled: m ? existsSync(m[1]) : null, linkTarget: m && existsSync(m[1]) ? readlinkSync(m[1]).replace(c.home, "~") : null };
    } },
  { id: "real-volta", when: () => have("volta"), only: ["zsh", "bash"],
    setup(c) {
      run(c, `export VOLTA_HOME=$HOME/.volta; export PATH=$VOLTA_HOME/bin:$PATH; volta install node@22 && echo '{}' > proj/package.json && cd proj && volta pin node@20`);
      c.add("rc", 'export VOLTA_HOME="$HOME/.volta"\nexport PATH="$VOLTA_HOME/bin:$PATH"');
    } },
  { id: "real-mise-activate", when: () => have("mise"), only: ["zsh", "bash", "fish"],
    setup(c) {
      run(c, `mise use -g node@22 && mise install node@20 && printf '[tools]\\nnode = "20"\\n' > proj/mise.toml && mise trust proj/mise.toml`);
      c.add("rc", P(`eval "$(mise activate ${sh(c)})"`, "mise activate fish | source"));
    } },
  { id: "real-mise-shims", when: () => have("mise"), only: ["zsh", "bash"],
    setup(c) {
      run(c, `mise use -g node@22 && mise install node@20 && printf '[tools]\\nnode = "20"\\n' > proj/mise.toml && mise trust proj/mise.toml && mise reshim`);
      c.add("profile", 'export PATH="$HOME/.local/share/mise/shims:$PATH"');
    } },
  { id: "real-asdf", when: () => have("asdf"), only: ["zsh", "bash"],
    setup(c) {
      run(c, `export NODEJS_CHECK_SIGNATURES=no; asdf plugin add nodejs && asdf install nodejs 22.11.0 && asdf install nodejs 20.18.0 && asdf set -u nodejs 22.11.0 && cd proj && asdf set nodejs 20.18.0`);
      c.add("rc", 'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"');
    } },
  { id: "real-pyenv", when: () => have("pyenv"), only: ["zsh", "bash"],
    setup(c) {
      run(c, `export PYENV_ROOT=$HOME/.pyenv; export PATH=$PYENV_ROOT/bin:$PATH; pyenv install 3.12.7 && pyenv install 3.11.10 && pyenv global 3.12.7 && echo 3.11.10 > proj/.python-version`, 1500000);
      c.add("rc", 'export PYENV_ROOT="$HOME/.pyenv"\nexport PATH="$PYENV_ROOT/bin:$PATH"\neval "$(pyenv init -)"');
    } },
  { id: "real-uv-python", when: () => have("uv"), only: ["zsh", "bash", "fish"],
    setup(c) {
      run(c, `uv python install 3.13 --default --preview`);
      c.add("env", P('export PATH="$HOME/.local/bin:$PATH"', "set -gx PATH $HOME/.local/bin $PATH"));
    } },
  { id: "real-corepack-pnpm", when: () => !!process.env.K6_NODE_BIN, only: ["zsh", "bash"],
    setup(c) {
      run(c, `export PATH=${process.env.K6_NODE_BIN}:$PATH; export COREPACK_HOME=$HOME/.cache/corepack; mkdir -p $HOME/.local/bin && corepack enable --install-directory $HOME/.local/bin pnpm && printf '{"packageManager":"pnpm@10.12.1"}' > proj/package.json`);
      c.add("env", `export PATH="$HOME/.local/bin:${process.env.K6_NODE_BIN}:$PATH"\nexport COREPACK_HOME="$HOME/.cache/corepack"`);
    },
    // 垫片第一次执行要联网下载 pnpm：测检测命令耗时（这对 2 秒预算很关键）
    async post(c, res) {
      const env = { PATH: `${c.home}/.local/bin:${process.env.K6_NODE_BIN}:/usr/bin:/bin`, HOME: c.home, COREPACK_HOME: `${c.home}/.cache/corepack` };
      const first = await runVersion(`${c.home}/.local/bin/pnpm`, env, c.project, 60000);
      const second = await runVersion(`${c.home}/.local/bin/pnpm`, env, c.project, 60000);
      return { firstPnpmVersion: first.out, firstMs: Math.round(first.ms), secondMs: Math.round(second.ms) };
    } },
];

export async function runReal(kinds) {
  const rows = [];
  // 这些用例会真的下载并安装东西（装进临时 HOME），只许在一次性的 CI 机器上跑
  if (!process.env.CI && !process.env.K6_ALLOW_REAL_INSTALL) { console.log("SKIP real-managers: not on CI (set K6_ALLOW_REAL_INSTALL=1 to force)"); return rows; }
  for (const def of REAL) {
    if (def.when && !def.when()) { console.log(`SKIP ${def.id} (not installed)`); continue; }
    for (const kind of kinds) {
      if (def.only && !def.only.includes(kind)) continue;
      for (const cwdMode of def.project || def.id.includes("mise") || def.id.includes("volta") || def.id.includes("asdf") || def.id.includes("pyenv") || def.id.includes("corepack") ? ["home", "project"] : ["home"]) {
        const t0 = Date.now();
        const r = await runCase(def, kind, { cwdMode, timeoutMs: 20000 });
        if (r.skipped) continue;
        if (def.post) r.notes = await def.post(r.ctx, r);
        rows.push(r);
        const good = typeof r.resolver !== "string" && Object.values(r.resolver).every(isGood);
        console.log(`${good ? "OK  " : "DIFF"} ${def.id} [${kind}/${cwdMode}] resolve ${Math.round(r.meta.ms)}ms (case total ${Math.round((Date.now() - t0) / 1000)}s)\n   resolver: ${JSON.stringify(r.resolver)}\n   gt: ${JSON.stringify(Object.fromEntries(Object.entries(r.gt).map(([k, v]) => [k, v.missing ? "-" : `${v.version}@${(v.path || "").replace(os.homedir(), "~")}`])))}${r.notes ? "\n   notes: " + JSON.stringify(r.notes) : ""}${r.setupErrors ? "\n   SETUP-ERRORS: " + r.setupErrors.join(" || ") : ""}`);
      }
    }
  }
  return rows;
}
