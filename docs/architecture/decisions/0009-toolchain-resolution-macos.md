# 0009. 图形应用通过登录 shell 获取用户的工具链环境（macOS）

状态：已接受

日期：2026-10-12

来源：技术设计 §4.8、§7.1、§11.1 的 K6；PRD #prd-settings-toolchain

完整的实验数字、伪代码和陷阱清单：[evidence/0009-toolchain-resolution-macos.md](../evidence/0009-toolchain-resolution-macos.md)。

## 背景

从 Finder 或 Dock 启动的应用没有终端的环境变量，找不到 nvm、fnm、Volta、mise、asdf、pyenv 提供的工具。技术验证 K6（macOS 部分，PR #1，Actions 运行 38164928497）用真实 zsh、15 个合成环境、`macos-26` 上的真实版本管理器和 21 种杂乱启动文件验证了“向登录 shell 要一次环境”。结果：矩阵本机 98/98、CI 183/183 与终端一致；本机真实环境解析中位数 985 ms（p95 1031 ms），加检测约 1.25 s。

## 决定

macOS 上由 `platform.env.load` 向登录 shell 要环境：用 `os.userInfo().shell` 找 shell；登录加交互，在随机标记之间用 `env -0` 打印环境；stdin 为空，自成进程组，10 秒硬超时，看到结束标记即杀进程组。命令里先预热懒加载的工具，再手动跑 precmd 钩子。依次尝试：`-c` 带命令、命令写 stdin、只用内建打印 `PATH`、非交互登录（标为降级）；全部失败或超时则扫描常见目录。结果按“shell + 启动文件 mtime（项目则加路径和版本文件 mtime）”缓存，TTL 1 小时，应用启动和“重新检测”时后台刷新，界面不等待。检测命令和工具链检测都以项目文件夹为 cwd。`env.load` 接受 `cwd` 并返回来源。K6 的通过标准改为“首次解析在典型环境下 ≤ 2 秒；更久时界面不阻塞”。

## 后果

- 2 秒只是典型值，不是保证；解析在后台，界面必须在它完成前可用。
- `env.load(opts?: { refresh?, cwd? })` 返回 `{ env, source, ms }`，`source` 是 `login-shell`、`login-shell-degraded`、`path-only`、`fallback` 之一。
- 新增提示码 `ENV_UNRESOLVED`（解析失败，带原因）、`ENV_DEGRADED`（只读到非交互环境），登记在 `protocol`，两种语言都要有文案。
- 检测脚本按工具定义（Go 用 `go version`）；不为每个版本管理器写专门逻辑。
- 不能解析的 shell（nu、tcsh 等）直接走回退，用户用“指定路径…”。
- 资源库放在“桌面”“文档”“下载”里会触发 macOS 的隐私权限弹窗，默认 `~/Runyard` 不会；设置里选这三处时给警告。
- 未验证：真正的 Finder 双击启动、重型 `.zshrc`、重启后的冷启动；见依据文档。

## 被否的方案

- 只扫常见目录：与完整解析一致率只有 61%（本机）、68%（CI），nvm 会选错版本，拿不到 mise activate；只作超时后的临时答案。
- 非交互登录 shell（不加 `-i`）：读不到 `.zshrc`，124 对里少 10 对。
- 每个版本管理器单独适配：实测不需要，维护成本高。
- 全局缓存加 home 做 cwd：Volta、mise shims、asdf、pyenv、corepack 会选错版本。
