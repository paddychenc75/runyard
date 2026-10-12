import type { EnvSource } from "@runyard/protocol";
import type { ShellKind } from "../posix/env/login-shell.ts";
import { fixedTool, shimTool } from "./synthetic-home.ts";

// 合成环境矩阵（证据 0009 的做法）：每个用例是一套假的版本管理器加启动文件，
// 以及在主目录和项目文件夹里各应该得到的版本。假工具只打印版本，行为与各管理器的文档一致。

export interface ProjectCase {
  /** 项目文件夹名（建在合成主目录里） */
  readonly name: string;
  /** 相对项目文件夹的版本文件 */
  readonly files: Readonly<Record<string, string>>;
  readonly expect: string;
}

export interface EnvCase {
  readonly id: string;
  readonly tool: "node" | "python";
  /** 相对主目录的文件；按 shell 种类给，因为启动文件和钩子的写法不同 */
  files(kind: ShellKind): Record<string, string>;
  /** 以主目录为工作目录时的版本 */
  readonly home: string;
  readonly projects?: readonly ProjectCase[];
  readonly source?: EnvSource;
  /** 需要这些 shell 都装了才注册 */
  readonly needs?: readonly ShellKind[];
}

/** 启动文件：zsh 读 .zshrc；交互登录的 bash 只读 .bash_profile，所以让它转去读 .bashrc */
function rc(kind: ShellKind, content: string): Record<string, string> {
  if (kind === "zsh") return { ".zshrc": content };
  return { ".bashrc": content, ".bash_profile": '[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"\n' };
}

const STRIP_TO_PATH = 'export PATH="$HOME/bin:$PATH"\n';
const bin = (version: string) => ({ "bin/node": fixedTool(`v${version}`) });

const NVM_FILES = {
  ".nvm/versions/node/v22.0.0/bin/node": fixedTool("v22.0.0"),
  ".nvm/versions/node/v24.0.0/bin/node": fixedTool("v24.0.0"),
  ".nvm/alias/default": "24.0.0",
  ".nvm/nvm.sh":
    'v=$(cat "$NVM_DIR/alias/default"); PATH="$NVM_DIR/versions/node/v$v/bin:$PATH"; export PATH\n',
};

// fnm --use-on-cd 与 mise activate 的共同点：在 shell 里按 $PWD 的 .node-version 改 PATH
const PICK_BY_CWD = (dir: string) =>
  `if [ -f .node-version ]; then __v=$(cat .node-version); else __v=24.0.0; fi; PATH="$HOME/${dir}/v$__v/bin:$PATH"; export PATH`;
const versioned = (dir: string) => ({
  [`${dir}/v24.0.0/bin/node`]: fixedTool("v24.0.0"),
  [`${dir}/v22.0.0/bin/node`]: fixedTool("v22.0.0"),
});
const NOISE_MARK = "__RUNYARD_ENV_0000_START__ marker-like __RUNYARD_ENV_0000_END__";

export const ENV_CASES: readonly EnvCase[] = [
  {
    id: "plain-path",
    tool: "node",
    home: "20.1.0",
    files: (k) => ({ ...bin("20.1.0"), ...rc(k, STRIP_TO_PATH) }),
  },
  {
    id: "nvm-default",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ...NVM_FILES,
      ...rc(k, 'export NVM_DIR="$HOME/.nvm"\n. "$NVM_DIR/nvm.sh"\n'),
    }),
  },
  {
    id: "nvm-lazy-function",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ...NVM_FILES,
      ...rc(
        k,
        'export NVM_DIR="$HOME/.nvm"\nnode() { unset -f node; . "$NVM_DIR/nvm.sh"; node "$@"; }\n',
      ),
    }),
  },
  {
    id: "fnm-use-on-cd",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({ ...versioned(".fnm"), ...rc(k, `${PICK_BY_CWD(".fnm")}\n`) }),
    projects: [{ name: "proj", files: { ".node-version": "22.0.0" }, expect: "22.0.0" }],
  },
  {
    id: "volta-shims",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ".volta/bin/node": shimTool("node"),
      ".default-node": "24.0.0",
      ...rc(k, 'export PATH="$HOME/.volta/bin:$PATH"\n'),
    }),
    projects: [{ name: "proj", files: { ".node-version": "22.0.0" }, expect: "22.0.0" }],
  },
  {
    id: "mise-shims",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ".local/share/mise/shims/node": shimTool("node"),
      ".default-node": "24.0.0",
      ...rc(k, 'export PATH="$HOME/.local/share/mise/shims:$PATH"\n'),
    }),
    projects: [{ name: "proj", files: { ".tool-versions": "nodejs 20.5.0\n" }, expect: "20.5.0" }],
  },
  {
    id: "mise-activate-precmd",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ...versioned(".mise"),
      ...rc(
        k,
        k === "zsh"
          ? `__mise_hook() { ${PICK_BY_CWD(".mise")}; }\nprecmd_functions+=(__mise_hook)\n`
          : `__mise_hook() { ${PICK_BY_CWD(".mise")}; }\nPROMPT_COMMAND="__mise_hook\${PROMPT_COMMAND:+;$PROMPT_COMMAND}"\n`,
      ),
    }),
    projects: [{ name: "proj", files: { ".node-version": "22.0.0" }, expect: "22.0.0" }],
  },
  {
    id: "asdf-tool-versions-cwd-vs-home",
    tool: "node",
    home: "24.0.0",
    files: (k) => ({
      ".asdf/shims/node": shimTool("node"),
      ".tool-versions": "nodejs 24.0.0\n",
      ...rc(k, 'export PATH="$HOME/.asdf/shims:$PATH"\n'),
    }),
    projects: [
      { name: "with-file", files: { ".tool-versions": "nodejs 18.0.0\n" }, expect: "18.0.0" },
      { name: "without-file", files: {}, expect: "24.0.0" },
    ],
  },
  {
    id: "pyenv-shims",
    tool: "python",
    home: "3.13.0",
    files: (k) => ({
      ".pyenv/shims/python": shimTool("python"),
      ".default-python": "3.13.0",
      ...rc(k, 'export PYENV_ROOT="$HOME/.pyenv"\nexport PATH="$PYENV_ROOT/shims:$PATH"\n'),
    }),
    projects: [{ name: "proj", files: { ".python-version": "3.12.0" }, expect: "3.12.0" }],
  },
  {
    id: "homebrew-prefix-in-login-file",
    tool: "node",
    home: "21.0.0",
    files: () => ({
      "brew/bin/brew": "#!/bin/sh\necho 'export PATH=\"$HOME/brew/bin:$PATH\"'\n",
      "brew/bin/node": fixedTool("v21.0.0"),
      ".zprofile": 'eval "$("$HOME/brew/bin/brew" shellenv)"\n',
      ".bash_profile": 'eval "$("$HOME/brew/bin/brew" shellenv)"\n',
    }),
  },
  {
    id: "startup-reads-stdin",
    tool: "node",
    home: "20.1.0",
    files: (k) => ({
      ...bin("20.1.0"),
      ...rc(k, `read -r __answer\nread -r __answer2\n${STRIP_TO_PATH}`),
    }),
  },
  {
    id: "rc-execs-another-shell",
    tool: "node",
    home: "20.1.0",
    needs: ["zsh", "bash"],
    files: (k) =>
      k === "zsh"
        ? { ...bin("20.1.0"), ".zshrc": "exec /bin/bash -l -i\n", ".bash_profile": STRIP_TO_PATH }
        : { ...bin("20.1.0"), ".bash_profile": "exec zsh -l -i\n", ".zshrc": STRIP_TO_PATH },
  },
  {
    id: "rc-exits-only-noninteractive-login-works",
    tool: "node",
    home: "20.1.0",
    source: "login-shell-degraded",
    files: (k) =>
      k === "zsh"
        ? { ...bin("20.1.0"), ".zprofile": STRIP_TO_PATH, ".zshrc": "exit 3\n" }
        : {
            ...bin("20.1.0"),
            ".bash_profile": `${STRIP_TO_PATH}. "$HOME/.bashrc"\n`,
            ".bashrc": "case $- in *i*) ;; *) return;; esac\nexit 3\n",
          },
  },
  {
    id: "noise-marker-like-text-multiline-values",
    tool: "node",
    home: "20.1.0",
    files: (k) => ({
      ...bin("20.1.0"),
      ...rc(
        k,
        [
          "printf 'noise-without-newline'",
          "printf '\\033]0;title\\007\\033[31mred\\033[0m\\n'",
          `printf '%s\\n' '${NOISE_MARK}'`,
          "echo 'stderr noise' >&2",
          "export RY_MULTI=$'line1\\nline2 __RUNYARD_ENV_0000_START__\\nline3'",
          STRIP_TO_PATH.trim(),
          "printf 'trailing-noise-without-newline'",
          "",
        ].join("\n"),
      ),
    }),
  },
  {
    id: "huge-and-non-utf8-values",
    tool: "node",
    home: "20.1.0",
    files: (k) => ({
      ...bin("20.1.0"),
      ...rc(
        k,
        `export RY_HUGE=$(head -c 100000 /dev/zero | tr '\\0' x)\nexport RY_BIN=$(printf 'a\\377b')\n${STRIP_TO_PATH}`,
      ),
    }),
  },
  {
    id: "strict-mode-left-on",
    tool: "node",
    home: "20.1.0",
    files: (k) => ({ ...bin("20.1.0"), ...rc(k, `set -eu\n${STRIP_TO_PATH}`) }),
  },
];
