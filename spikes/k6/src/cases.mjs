// 版本管理工具矩阵。能"只是往 PATH 前面加目录 / 定义函数"的管理器用假可执行文件忠实复现，
// 真正的 nvm 在本机只读使用（real-nvm 用例），其余真实管理器在 macos-26 CI 上装来对照（见 real-managers.mjs）。
import { existsSync } from "node:fs";

const P = (posix, fish) => ({ posix, fish });
const exportPath = (dir) => P(`export PATH="${dir}:$PATH"`, `set -gx PATH ${dir} $PATH`);

export const CASES = [
  {
    id: "baseline-system",
    noBrew: true,
    title: "没有任何版本管理器（对照组）",
    faked: "n/a",
    setup(c) {
      c.tool("hb/bin/node", "v20.11.0");
      c.add("profile", exportPath(`${c.home}/hb/bin`)); // 相当于 .zprofile 里的 brew shellenv
    },
  },
  {
    id: "homebrew-real",
    noBrew: true,
    title: "真实 Homebrew：.zprofile 里 eval $(brew shellenv)，/opt/homebrew/bin 里的真 python3",
    faked: "real brew shellenv",
    when: () => existsSync("/opt/homebrew/bin/brew"),
    only: ["zsh", "bash", "fish"],
    setup(c) {
      c.add("profile", P('eval "$(/opt/homebrew/bin/brew shellenv)"', "/opt/homebrew/bin/brew shellenv | source"));
    },
  },
  {
    id: "nvm-default",
    title: "nvm：rc 里 source nvm.sh，默认别名指向 22.1.0（PATH 在 source 时写入）",
    faked: "假 nvm.sh（行为：读 alias/default，把版本目录加入 PATH，定义 nvm 函数）",
    only: ["zsh", "bash"],
    setup(c) {
      for (const v of ["v20.0.0", "v22.1.0", "v24.0.0"]) { c.tool(`.nvm/versions/node/${v}/bin/node`, v); c.tool(`.nvm/versions/node/${v}/bin/pnpm`, "9.1.0"); }
      c.write(".nvm/alias/default", "22.1.0\n");
      c.write(".nvm/nvm.sh", `nvm(){ echo "nvm 0.40"; }\n__d=$(cat "$NVM_DIR/alias/default")\nexport PATH="$NVM_DIR/versions/node/v$__d/bin:$PATH"\n`);
      c.add("rc", 'export NVM_DIR="$HOME/.nvm"\n[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"');
    },
    project(c) { c.write("proj/.nvmrc", "18\n"); }, // nvm 本身不会按 .nvmrc 自动切换；只有用户另加 chpwd 钩子才会
  },
  {
    id: "nvm-lazy",
    title: "nvm 懒加载：node/npm/pnpm 是 shell 函数，第一次调用才 source nvm.sh（command -v node 返回 \"node\"）",
    faked: "假 nvm.sh + 常见的懒加载函数写法",
    only: ["zsh", "bash"],
    setup(c) {
      c.tool(".nvm/versions/node/v22.1.0/bin/node", "v22.1.0");
      c.tool(".nvm/versions/node/v22.1.0/bin/pnpm", "9.1.0");
      c.write(".nvm/nvm.sh", `export PATH="$NVM_DIR/versions/node/v22.1.0/bin:$PATH"\n`);
      c.add("rc", `export NVM_DIR="$HOME/.nvm"
__nvm_lazy(){ unset -f node npm pnpm; . "$NVM_DIR/nvm.sh"; }
node(){ __nvm_lazy; node "$@"; }
npm(){ __nvm_lazy; npm "$@"; }
pnpm(){ __nvm_lazy; pnpm "$@"; }`);
    },
  },
  {
    id: "fnm",
    title: "fnm：rc 里 eval \"$(fnm env --use-on-cd)\"，PATH 指向每个 shell 一份的 multishell 软链接；.node-version 按目录切换",
    faked: "假 fnm（env 子命令创建 multishell 软链接并输出 export PATH；--use-on-cd 在启动时按 cwd 的 .node-version 切一次）",
    only: ["zsh", "bash"],
    setup(c) {
      for (const v of ["v20.0.0", "v22.2.0"]) c.tool(`.fnm/node-versions/${v}/installation/bin/node`, v);
      c.write(".fnm-default", "v22.2.0\n");
      c.exe(".local/bin/fnm", `# 假 fnm env
ver=$(cat "$HOME/.fnm-default")
[ -f "$PWD/.node-version" ] && ver="v$(cat "$PWD/.node-version")"
ms="$HOME/.local/state/fnm_multishells/$$_$(date +%s)"
mkdir -p "$(dirname "$ms")"
ln -s "$HOME/.fnm/node-versions/$ver/installation" "$ms"
echo "export PATH=\\"$ms/bin\\":\\"\\$PATH\\""`);
      c.add("env", exportPath(`${c.home}/.local/bin`));
      c.add("rc", 'eval "$(fnm env --use-on-cd)"');
    },
    project(c) { c.tool(".fnm/node-versions/v18.0.0/installation/bin/node", "v18.0.0"); c.write("proj/.node-version", "18.0.0\n"); },
  },
  {
    id: "volta",
    title: "Volta：rc 里 PATH 前加 ~/.volta/bin（shim），项目 package.json 的 volta 字段按目录决定版本",
    faked: "假 shim（向上找 package.json 里的 volta.node）",
    only: ["zsh", "bash"],
    setup(c) {
      c.shim(".volta/bin/node", { file: "package.json", sed: 's/.*"node": *"\\([0-9.]*\\)".*/\\1/p', dflt: "20.9.0", fmt: "v@V@" });
      c.add("rc", 'export VOLTA_HOME="$HOME/.volta"\nexport PATH="$VOLTA_HOME/bin:$PATH"');
    },
    project(c) { c.write("proj/package.json", '{"volta": {"node": "18.7.0"}}\n'); },
    projectExpect: "shim 按 cwd 决定版本：detect 子进程必须以项目目录为 cwd",
  },
  {
    id: "mise-shims",
    title: "mise（shims 方式）：PATH 前加 mise shims，mise.toml 按目录决定版本",
    faked: "假 shim",
    only: ["zsh", "bash"],
    setup(c) {
      c.shim(".local/share/mise/shims/node", { file: "mise.toml", sed: 's/^node *= *"\\([0-9.]*\\)".*/\\1/p', dflt: "22.0.0", fmt: "v@V@" });
      c.add("profile", exportPath(`${c.home}/.local/share/mise/shims`));
    },
    project(c) { c.write("proj/mise.toml", '[tools]\nnode = "18.9.0"\n'); },
  },
  {
    id: "mise-activate",
    title: "mise activate（hook 方式）：PATH 只在每次提示符前（precmd）按 cwd 改写，启动时不改",
    faked: "假 hook（行为：precmd / PROMPT_COMMAND / fish_prompt 事件里按 $PWD/mise.toml 把版本目录放进 PATH）",
    setup(c) {
      for (const v of ["22.0.0", "18.9.0"]) c.tool(`.mise/installs/node/${v}/bin/node`, `v${v}`);
      const hookBody = `v=22.0.0; [ -f "$PWD/mise.toml" ] && v=$(sed -n 's/^node *= *"\\([0-9.]*\\)".*/\\1/p' "$PWD/mise.toml"); PATH="$HOME/.mise/installs/node/$v/bin:$(printf %s "$PATH" | sed "s#$HOME/.mise/installs/node/[0-9.]*/bin:##g")"; export PATH`;
      c.add("rc", P(
        `_mise_hook(){ ${hookBody}; }\nif [ -n "$ZSH_VERSION" ]; then precmd_functions+=(_mise_hook); else PROMPT_COMMAND="_mise_hook\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"; fi`,
        `function __mise_hook --on-event fish_prompt\n  set -l v 22.0.0\n  if test -f $PWD/mise.toml\n    set v (sed -n 's/^node *= *"\\([0-9.]*\\)".*/\\1/p' $PWD/mise.toml)\n  end\n  set -gx PATH $HOME/.mise/installs/node/$v/bin (string match -v -r '/\\.mise/installs/node/' $PATH)\nend`,
      ));
    },
    project(c) { c.write("proj/mise.toml", '[tools]\nnode = "18.9.0"\n'); },
  },
  {
    id: "asdf",
    title: "asdf：PATH 前加 ~/.asdf/shims，.tool-versions 按目录决定版本（全局默认在 ~/.tool-versions）",
    faked: "假 shim（读 .tool-versions）",
    only: ["zsh", "bash"],
    setup(c) {
      c.shim(".asdf/shims/node", { file: ".tool-versions", sed: 's/^nodejs  *\\([0-9.]*\\).*/\\1/p', dflt: "22.3.0", fmt: "v@V@" });
      c.shim(".asdf/shims/python3", { file: ".tool-versions", sed: 's/^python  *\\([0-9.]*\\).*/\\1/p', dflt: "3.12.2", fmt: "Python @V@" });
      c.add("rc", 'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"');
    },
    project(c) { c.write("proj/.tool-versions", "nodejs 18.20.0\npython 3.9.18\n"); },
  },
  {
    id: "pyenv",
    title: "pyenv：eval \"$(pyenv init -)\" 把 shims 加到 PATH；.python-version 按目录决定",
    faked: "假 pyenv + 假 shim",
    only: ["zsh", "bash"],
    setup(c) {
      c.exe(".pyenv/bin/pyenv", 'if [ "$1" = init ]; then echo \'export PATH="$HOME/.pyenv/shims:$PATH"\'; fi');
      c.shim(".pyenv/shims/python3", { file: ".python-version", sed: "p", dflt: "3.11.4", fmt: "Python @V@" });
      c.shim(".pyenv/shims/python", { file: ".python-version", sed: "p", dflt: "3.11.4", fmt: "Python @V@" });
      c.add("rc", 'export PYENV_ROOT="$HOME/.pyenv"\nexport PATH="$PYENV_ROOT/bin:$PATH"\neval "$(pyenv init -)"');
    },
    project(c) { c.write("proj/.python-version", "3.8.18\n"); },
  },
  {
    id: "uv-python",
    title: "uv：~/.local/bin 里有 uv 和指向 uv 管理的 Python 的 python3 链接，PATH 在 .zshenv/.profile 里加",
    faked: "假 uv、假 python",
    setup(c) {
      c.tool(".local/bin/uv", "uv 0.5.1 (abc 2025-01-01)");
      c.tool(".local/share/uv/python/cpython-3.13.0/bin/python3.13", "Python 3.13.0");
      c.exe(".local/bin/python3", 'exec "$HOME/.local/share/uv/python/cpython-3.13.0/bin/python3.13" "$@"');
      c.add("env", exportPath(`${c.home}/.local/bin`));
    },
  },
  {
    id: "uv-not-on-path",
    title: "uv 装在 ~/.local/bin 但用户 PATH 里没有这个目录（终端里也找不到）",
    faked: "假 uv",
    setup(c) { c.tool(".local/bin/uv", "uv 0.5.1 (abc 2025-01-01)"); },
  },
  {
    id: "pnpm-global",
    title: "pnpm：npm 全局安装在 node 的 bin 里（9.15.0）",
    faked: "假 pnpm",
    setup(c) {
      c.tool("g/bin/node", "v22.1.0");
      c.tool("g/bin/pnpm", "9.15.0");
      c.add("profile", exportPath(`${c.home}/g/bin`));
    },
  },
  {
    id: "pnpm-corepack",
    title: "pnpm 来自 corepack：~/.local/bin/pnpm 是 corepack 垫片，版本由项目 package.json 的 packageManager 决定",
    faked: "假垫片（读 packageManager）；真 corepack 在 CI 上测",
    setup(c) {
      c.tool("g/bin/node", "v22.1.0");
      c.shim(".local/bin/pnpm", { file: "package.json", sed: 's/.*"packageManager": *"pnpm@\\([0-9.]*\\)".*/\\1/p', dflt: "10.0.0", fmt: "@V@" });
      c.add("env", exportPath(`${c.home}/.local/bin`));
      c.add("profile", exportPath(`${c.home}/g/bin`));
    },
    project(c) { c.write("proj/package.json", '{"packageManager": "pnpm@8.15.9"}\n'); },
  },
  {
    id: "path-only-in-zshrc",
    title: "PATH 只在 rc 里设置（非交互登录 shell 读不到）",
    faked: "n/a",
    setup(c) {
      c.tool("rcbin/node", "v21.7.0");
      c.add("rc", exportPath(`${c.home}/rcbin`));
    },
  },
];

// 项目目录里放版本文件的钩子（对应用例的 project 函数）。
export function applyProject(def, ctx) { def.project?.(ctx); }
