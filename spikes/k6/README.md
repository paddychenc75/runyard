# K6（macOS 部分）：图形应用能否找到用户终端里的那套工具

技术设计 §11.1 行 K6，只做 macOS 部分。Windows 部分（商店占位程序、winget 装完不重启就能检测到）留给负责人的 Windows 真机。

## 问题

从 Finder/Dock 启动的应用拿不到终端的环境。Runyard 能否向用户的登录 shell 要来环境，找到和终端里**同一个** `node`、`pnpm`、`python`、`uv`、`go`，在 2 秒内完成？覆盖 nvm、fnm、Volta、mise、asdf、pyenv、uv、Homebrew、corepack，以及杂乱的启动文件和 fish。

## 怎么复现

```sh
cd spikes/k6 && node src/run.mjs matrix messy score ablation project staleness real finder gui timing
```

需要 Node 24，零依赖（只用 Node 内置模块；对照部分用系统自带的 `/usr/bin/python3` 开伪终端）。每个套件单独跑：`node src/run.mjs <套件>`。`real-managers` 会真的安装版本管理器，只在 `CI=1` 时运行。CI：`.github/workflows/spike-k6.yml`（macos-26 与 ubuntu-latest）。

## 环境

- 本机：Apple Silicon，macOS 27.0.1（`sw_vers`），zsh + nvm（默认别名 24），启动文件有 `_encode/_decode` 杂音。**测量期间机器上还有别的 spike 在跑，负载约 3，计时数字偏悲观。**
- CI：macos-26 runner（Apple Silicon，Homebrew 装了 fish、nvm、fnm、volta、mise、asdf、pyenv、uv、starship、powerlevel10k）；ubuntu-latest（apt 装 fish、zsh）。runner 是一次性机器，启动文件几乎是空的，所以**CI 上的耗时不代表真实用户**，只用于验证正确性。
- 结果文件：`results-mac-local/`（本机）、`results-ci/macos/`、`results-ci/linux/`；CI 运行 https://github.com/paddychenc75/runyard/actions/runs/38164928497（第二轮，成功；第一轮 38163481092 因消融太慢被取消，无数据）。
- 伪造与真实：本机只有真实 nvm 和真实 Homebrew（只读）；其余管理器在本机是**假的**（假可执行文件，行为与文档一致，见 `src/cases.mjs`）。macos-26 上装了**真的** nvm、fnm、Volta、mise（hook 与 shims 两种）、asdf、pyenv、uv、corepack（Node 24 自带），用同一套对照比较（`src/real-managers.mjs`），所有真实管理器与假实现结论一致。

## 做了哪些实验

对照（ground truth）：在同一个 `HOME` 里，用 Python 的 `pty` 开一个**真正的伪终端**，启动 `$SHELL -l`（交互登录，会画提示符、跑 precmd/chpwd 钩子），输入 `command -v X; X --version`。解析器的结果与它逐项比较：`same`（路径和版本都一致）、`same(real)`（软链接指向同一文件）、`same-version(fn)`（终端里是 shell 函数，只能比版本）、`WRONG-version`、`miss` 等。"朴素"= 不解析，直接用 Finder 的极简 `PATH`；"扫描"= 第 7 项的常见目录回退。

| # | 实验 | 重复 | 结果 |
| --- | --- | --- | --- |
| 1 | 真实 zsh（只读，用户真实 HOME，Finder 式极简环境 `env -i`） | 5 个工具 | 解析器 5/5 与终端一致（node 24.21.0、pnpm 11.28.0、python3.14.3、uv 0.11.7、go 在 gvm 目录）；朴素 0/5；扫描 2/5 完全一致（node 选了最高版本 v25.6 而不是默认别名 24；go 没找到；pnpm 版本同路径不同） |
| 2 | 模拟 Finder：`env -i` 启动解析器 | 1 | 进程只拿到 8 个变量（HOME、LANG、LOGNAME、PATH、TMPDIR、USER、XPC_FLAGS、`__CF_USER_TEXT_ENCODING`），没有 `SHELL`；登录 shell 由 `os.userInfo().shell` 得到 `/bin/zsh`，解析 0.96 s |
| 2b | 真实 LaunchServices：临时 `.app`（脚本可执行文件）用 `open -W -n` 启动，随后删除 | 2 种 | **发现：本机 `open` 会把调用者的整个环境（128 个变量）传给被启动的应用**，所以"从终端 `open`"不等于 Finder 启动。让 `open` 自己也用极简环境时，应用收到 18 个变量，**含 `SHELL=/bin/zsh`**、`SSH_AUTH_SOCK`、`COMMAND_MODE`、`__CFBundleIdentifier`，`PATH` 是极简的。两种情形解析均成功（0.9 s / 1.2 s），node 24.21.0。真正的 Finder/Dock 双击没有自动化（需要点按操作）；以 `env -i open` 作为最接近的近似 |
| 3 | 矩阵：15 个合成环境 × zsh/bash（× 有项目目录版本文件时的 home/project 两个 cwd）。本机 98 个有意义的（用例,工具）对，CI macOS（含 fish）183 对 | 1 次/格 | **解析器 98/98（本机）、183/183（CI macOS，含 fish）**；朴素 4/98、0/183；扫描 60/98（61%）、124/183（68%） |
| 3b | 真实管理器（macos-26）：nvm、fnm、Volta、mise activate（zsh/bash/fish）、mise shims、asdf、pyenv、uv python、corepack pnpm；每个 home 与 project 两个 cwd | 各 1 次 | 全部与终端一致（`real-managers.json`）。fnm 的 multishell 软链接在 shell 被杀后仍然存在（可用）；corepack 垫片首次 `pnpm --version` 2154 ms（含下载），之后约 180–230 ms |
| 3c | Linux 第二数据点（ubuntu-latest） | 1 次/格 | bash 22/22、fish 9/9 一致；**zsh 的对照在 Linux 上取不到数据（对照脚本问题，不是解析器问题），未计入、未验证** |
| 4 | 杂乱启动文件，21 种×(zsh/bash/fish) | 1 次/格 | 见下表 |
| 5 | 计时：本机真实 zsh，每项 25 次 | 25 | 见下 |
| 5b | 缓存失效四种变化 | 1 | 见下 |
| 6 | 按项目目录：三种做法对比 | 1 | 见下 |
| 7 | 常见目录回退的一致率 | 同 3 | 61%（本机）/ 68%（CI） |
| 消融 | 去掉预热/钩子/交互 | 62 对（本机）、124 对（CI） | CI：完整 124/124；去钩子 121；去预热 120；两者都去 117；只用非交互登录 shell 114 |

### 第 4 项：杂乱启动文件（macOS，本机与 CI 一致，除注明）

| 情形 | 结果 |
| --- | --- |
| 前后向 stdout/stderr 打杂音，无换行结尾 | 通过（标记之外的字节全部忽略） |
| 启动文件打印"长得像标记"的文字；变量值含换行和标记前缀 | 通过（每次调用用随机标记；`env -0` 以 NUL 分隔，值里的换行完整保留） |
| `sleep 3`（超过 2 秒预算） | 能解析，3.15 s（本机）/3.29 s（CI），**超出 2 秒** |
| `sleep 15`（超过 10 秒超时） | 10.0 s 后 `TIMEOUT`，进程组被杀，无残留 `sleep`（`pgrep` 核实）；回退到扫描 |
| 启动文件 `read` 提示、oh-my-zsh 式 `read -q`、`compinit` 的不安全目录提示 | 通过：stdin 是 `/dev/null`，提示立即得到 EOF，不挂起；compinit 打印 "can't open terminal" 后继续 |
| `set -u` 引用未定义变量 | 通过 |
| rc 里 `exit 3`、bash 里 `set -e`+失败命令（用户自己的终端也会被踢出） | 解析失败（`NO_START_MARKER`）或降级为非交互登录（取不到 rc 里的内容）；这类配置在终端里本身就是坏的 |
| 语法错误 | 终端里错误之后的内容同样不会执行，二者一致 |
| rc 末尾 `exec` 另一个 shell | 本机 zsh↔bash：命令走 stdin 的第二次尝试成功。CI：node 版本与沙箱预期不同（新的登录 shell 重新加了 brew 路径）——"拿到的是被 exec 出来的 shell 的环境"，与终端用户一致但与登录 shell 声明的不同。`exec fish`：macOS CI 通过；Linux 上 zsh 降级、bash 失败 |
| 后台任务继承 stdout（`(sleep 17.7 &)`） | 通过：看到结束标记就杀进程组，不等管道关闭 |
| 800 KB 的环境变量；5000 个变量 | macOS 通过（134 ms 内）；**Linux 失败**：单个变量超过 128 KB 时 `env` 无法 exec（E2BIG），得到标记齐全但为空的输出。已加 `EMPTY_ENV` 判定和"只用内建打印 PATH"的备用，但 macOS 上 800 KB 变量本来就能通过，备用路径**没有被真实触发过，未验证**，Linux 也未重测 |
| 非 UTF-8 字节 | 能解析，该值被替换为 U+FFFD，`lossy=true`（若落在 `PATH` 里的目录名上会出错，未见于实测） |
| iTerm2 / VS Code 的 OSC 转义序列、真实 starship、真实 powerlevel10k（先开一次交互会话生成 instant prompt 缓存） | 通过。p10k 是否真的启用了 instant prompt 没有单独核实 |
| rc 里调用 `stty`、`tput`、`tty` | 通过（stderr 报错被忽略） |

### 第 5 项：计时（本机真实 zsh，25 次；机器负载约 3）

| 项 | 中位数 | p95 | 最大 |
| --- | --- | --- | --- |
| 完整解析（登录+交互，预热+钩子） | 985 ms | 1031 | 1042 |
| 同上，不提前结束 | 977 | 1049 | 1076 |
| 去预热和钩子 | 998 | 1234 | 1299 |
| 仅 `-l -c`（不读 .zshrc） | 36 | 45 | 48 |
| `zsh -l -i -c exit`（无我们的命令） | 999 | 1041 | 1065 |
| `zsh -f -c true` | 2 | 3 | 3 |
| 启动一个 `node -e 0` | 26 | 28 | 28 |
| 5 个工具的检测（顺序执行 `--version`） | 253 | 256 | 256 |
| 读缓存+比较启动文件 mtime | 0.047 ms | 0.056 | 0.42 |

- 第一次（冷）= 998 ms，和后面没有区别：系统文件缓存无法可靠清除，所以"冷"只指进程内第一次，**真正重启后的冷启动没有测**。
- 耗时几乎全部是用户的 `.zshrc`（`zsh -lic exit` 就要 ~1 s，我们的命令几乎不加时间）。`zprof` 显示大头是 nvm 加载（`nvm_auto` 461 ms）和 `compinit`（447 ms），其次 `cd`（255 ms）。提前结束没有收益（zsh 退出很快）。
- 解析 + 检测 ≈ 1.25 s，在本机真实环境下满足 2 秒，但余量只有一倍，别人的 `.zshrc` 稍重就会超；因此**必须缓存并在后台刷新，界面不能等它**。
- 检测应并行执行（5 个顺序检测占 253 ms）；corepack 垫片第一次可能联网（2 s）。

### 第 5b 项：缓存什么时候失效（`staleness.json`）

| 变化 | 启动文件 mtime 变了吗 | 用旧缓存的结果 |
| --- | --- | --- |
| `nvm alias default 24`（只改 `~/.nvm/alias/default`） | 没变 | **旧**（22.1.0）；重新解析后才是 24.0.0 |
| 往 `PATH` 里已有的目录装新工具 | 没变 | **能找到**（`which` 实时查，不用重解析） |
| 在启动文件里新加 `PATH` 目录 | 变了 | 找不到，重新解析后找到 |

规则：缓存 = 解析出的环境 + 登录 shell + 启动文件 mtime 指纹；`which`/`--version` 永远实时跑；指纹变化立即重解析；另有 TTL（建议 1 小时）+ 每次应用启动、每次"重新检测"后台刷新（nvm 默认版本变化这类不改启动文件的变化靠它）。

### 第 6 项：按项目目录（`project.json`）

| 做法 | 结果 |
| --- | --- |
| 捕获和检测都用项目目录做 cwd | 全部与终端一致 |
| 捕获用 home、检测用项目目录 | 只有 **fnm（`--use-on-cd`）和 mise activate（hook）** 错：它们在 shell 启动时按 cwd 改 `PATH` |
| 捕获和检测都用 home（全局缓存） | Volta、mise shims、asdf、pyenv、corepack 错：shim 在**执行时**按 cwd 选版本 |
| nvm | 不受 cwd 影响（`.nvmrc` 只有用户另加钩子才自动生效） |

结论：**检测命令（`--version`）必须以项目目录为 cwd**；向 shell 要环境这一步只有项目里存在版本文件（`.node-version`、`.nvmrc`、`.tool-versions`、`mise.toml`、`.python-version`、`package.json`）时才需要以项目目录为 cwd 再要一次，缓存键加上项目路径和这些文件的 mtime。没有版本文件的项目共用全局缓存。

## 对照通过标准

| 标准 | 判定 | 证据 |
| --- | --- | --- |
| macOS：解析出的 node 与终端里一致 | **通过** | 真实 zsh 5/5；矩阵本机 98/98；macOS CI 183/183（含真实 nvm、fnm、Volta、mise、asdf、pyenv、uv、corepack 与 fish）。限制：有两处"一致"依赖我们做了对应处理——懒加载 nvm 要预热，mise hook 要手动跑 precmd；去掉后分别掉 4 对和 3 对 |
| 2 秒内完成 | **有条件通过** | 本机真实环境中位数 985 ms，p95 1031 ms，加检测 ≈ 1.25 s。启动文件稍重（实测 `sleep 3`）就超；超过 10 秒会超时。需靠缓存+后台刷新保证界面不等待 |
| 含启动文件杂乱输出 | **通过** | 见第 4 项 |
| 超过 10 秒 | **通过（行为明确）** | 10.0 s 超时，进程组被杀，无残留，回退扫描 |
| shell 是 fish | **通过（CI）** | macos-26 fish 10/10 对；ubuntu fish 9/9 对。本机没有 fish，未在本机测 |
| 回退（常见目录 + 指定路径）可用 | **部分** | 扫描与完整解析一致率只有 61%（本机）/68%（CI）：对 nvm 选错版本、拿不到 mise activate、拿不到懒加载 nvm 的函数。只能作为"超时/失败时先显示点什么"的临时答案，不能当主路径 |

## 结论

设计成立：§4.8 的"向登录 shell 要一次环境"可行，且不需要为每个版本管理器写专门逻辑。但原文有几处需要改（见下），尤其是：只做"登录 shell 打印 env"不够，需要预热、钩子、stdin 备用和 cwd 规则；"超时 10 秒"不等于"2 秒内"。不需要退到"只靠常见目录"。

### 推荐算法

```
resolveEnv(project?):
  shell = os.userInfo().shell  → dscl . -read /Users/$USER UserShell → $SHELL → /bin/zsh   // SHELL 在 Finder 里可能缺失
  kind = zsh | bash | fish ;  其他（nu、tcsh…）→ 直接走回退
  base = 进程环境 + RUNYARD_RESOLVING_ENV=1        // 让用户的启动文件能识别并跳过交互内容
  nonce = 8 字节随机；START/END = "__RUNYARD_ENV_<nonce>_START__/_END__"
  cmd = [钩子] + [预热] + printf START; /usr/bin/env -0; printf END
    钩子(zsh/bash)：跑 precmd_functions / PROMPT_COMMAND（fish：emit fish_prompt）  // mise activate 只在提示符前改 PATH
    预热：对 node npm pnpm python3 python uv go：command -v 不以 / 开头 → 调用一次 --version  // 懒加载 nvm 是函数
  尝试顺序（失败且不是超时才试下一个）：
    1. <shell> -l -i -c cmd         stdin=/dev/null，detached（无控制终端），cwd=项目目录或 home，超时 10 s
    2. <shell> -l -i，命令写 stdin    // 穿过 rc 里的 exec 另一个 shell
    3. <shell> -l -i -c "只用内建打印 PATH"   // env 无法 exec（单个变量 >128 KB）
    4. <shell> -l -c cmd             // 读不到 .zshrc，标记为"降级"
    全部失败 / 超时 → 扫描常见目录，界面标"未能读取登录环境"
  读到 START 后第一个 END 之间的字节；按 NUL 分割，首个 '=' 切键值；标记之外全忽略
  看到 END 立即杀进程组（只杀自己创建的组）
  若得到的环境既无 PATH 也无 HOME → 视为失败（EMPTY_ENV）
cache: key = (shell, 启动文件 mtime 指纹[, 项目路径+版本文件 mtime 指纹]) ；TTL 1 h；启动和"重新检测"时后台刷新；界面先用旧值
detect(tool, env, projectDir): which 手写（按 env.PATH，不用 process.env）→ 以 projectDir 为 cwd 跑该工具自己的版本命令（go 用 `go version`，其余 --version）→ 解析版本号
```

### 陷阱清单

| 陷阱 | 需要什么 |
| --- | --- |
| Finder 里没有 `SHELL` | 用 `getpwuid`（`os.userInfo().shell`），dscl 备用 |
| 非交互登录 shell 读不到 `.zshrc`（nvm、fnm、Volta 常写在这里） | 必须 `-i`；实测只用 `-l` 会少 10/124 对 |
| 懒加载 nvm：`command -v node` 返回函数名 | 预热：调用一次再导出 |
| `mise activate`：PATH 只在提示符前更新 | 手动跑 precmd/PROMPT_COMMAND/fish_prompt |
| shim 管理器（asdf、pyenv、Volta、mise shims、corepack）按 cwd 选版本 | 检测命令以项目目录为 cwd |
| fnm `--use-on-cd`、mise activate 在启动时按 cwd 改 PATH | 有版本文件的项目，以项目为 cwd 再捕获一次 |
| nvm 默认别名改了但启动文件没改 | 不能只靠 mtime，需 TTL+后台刷新+"重新检测" |
| rc 里 `exec` 别的 shell 吞掉 `-c` 命令 | stdin 备用尝试 |
| rc 里 `read`/更新提示/compinit 提示 | stdin=/dev/null 即可，实测不挂起 |
| rc 里 sleep/慢 | 超时 10 s，杀进程组，回退扫描；不要同步等待 |
| 后台任务占着 stdout 管道 | 看到 END 就杀进程组，不等管道关闭 |
| 单个环境变量 >128 KB（Linux）使 `env` 无法 exec | EMPTY_ENV 判定 + 内建打印 PATH 备用 |
| 非 UTF-8 字节 | 按 latin1 切分再按 UTF-8 还原，标记 lossy |
| Go 没有 `--version` | 检测脚本按工具定义（`go version`）；这是 §4.8 工具定义里"检测脚本"要写进去的 |
| `open` 会转发调用者环境（本机实测） | 测试"从 Finder 启动"不能只用终端里的 `open` |
| 从 LaunchServices 启动的进程读 `~/Desktop` 会弹隐私权限框并一直等待 | 本实验的 `.app` 探针把代码复制到临时目录；产品里读用户目录要留意 |
| 用户在 PATH 之外装了工具（`~/.local/bin` 没进 PATH） | 终端里也找不到；扫描会"多找到"，界面应说明来源 |

### 超时或意见不一致时界面应显示

- 解析超时/失败：先用扫描结果展示，并在状态里用代码 `ENV_UNRESOLVED`（带原因）说明"没能读取你终端的环境，可能不准"，附"重新检测"和"指定路径…"，后台继续重试一次。
- 扫描与解析器不同：以解析器为准；只在解析器失败时才展示扫描结果，且标明来源。
- 降级（只读到了非交互登录环境）：同样提示。

## 对技术设计的具体改动建议

1. **§4.8 表"macOS 的 `PATH`"一行**：把"管理进程启动后向登录 shell 要一次环境，超时 10 秒，失败就退回常见目录"改为：向登录 shell 要环境（登录+交互、随机标记、`env -0`、停掉 stdin、杀进程组、四步尝试顺序，见上面的伪代码）；结果缓存（shell + 启动文件 mtime + 1 小时 TTL），后台刷新，界面不等待；2 秒是本机实测的典型值而不是保证。把"nvm、fnm、Volta、asdf、pyenv 靠这一步自然找到，不为每个写专门逻辑"补上"懒加载 nvm 需要预热，mise activate 需要手动跑 precmd"。
2. **§4.8 "何时检查"和"判定"**：加"检测命令以项目目录为 cwd；有版本文件的项目再以项目目录为 cwd 捕获一次环境，缓存键含项目路径"。工具定义的检测脚本里每个工具自带版本命令（Go 是 `go version`）。
3. **§7.1 `env.load`**：签名改为 `load(opts?: { refresh?: boolean; cwd?: AbsPath }): Promise<{ env; source: 'login-shell' | 'login-shell-degraded' | 'path-only' | 'fallback'; ms: number }>`，让调用方知道结果可信程度；`source` 与失败原因是代码，不是句子（符合 §5.1 的"协议里没有句子"）。
4. **§11.1 K6 行**：通过标准里"2 秒内完成"改为"首次解析在典型环境下 ≤ 2 秒；超过时界面不阻塞"；"不通过时"栏的回退写明"扫描只是临时答案（与完整解析一致率 61–68%）"。
5. 新增提示码：`ENV_UNRESOLVED`、`ENV_DEGRADED`（登记在 `protocol`，§5.1）。

## 需要在其他人环境复核

负责人的 Windows 真机部分（商店占位程序、winget、重新检测）不在本 spike。macOS 上本 spike 无法复现的：
- 真正的 Finder/Dock 双击启动（只用 `env -i open` 近似；真 launchd 的 `PATH` 是否恰为 `/usr/bin:/bin:/usr/sbin:/sbin` 未实测）。
- 别人的重型 `.zshrc`（oh-my-zsh 全家桶、conda init、pyenv 全家桶、1Password/ssh-agent 钩子）；重启后的真正冷启动。
- 只在被 `exec` 出来的 shell（`exec fish`/`exec nu`）里才设置 PATH 的用户。
- powerlevel10k instant prompt 是否真被激活（CI 里通过，但没有确认它开启了）。
- nu、tcsh、xonsh 等 shell（直接走回退，未实测）。
- fnm multishell 软链接在多日之后是否被清理（实测 shell 被杀后仍在）。
- Linux 的 zsh 对照（对照脚本在 ubuntu 上没取到数据）。
- 企业环境（MDM 改写的 `/etc/zprofile`、目录服务账户的 shell）。

## 安装与核查

- **依赖：零**。`package.json` 无 dependencies；`pnpm-workspace.yaml` 不属于根工作区，写了 `minimumReleaseAge: 20160`。
- CI 里 `brew install` 了 fish、zsh-syntax-highlighting、nvm、fnm、volta、mise、asdf、pyenv、uv、starship、powerlevel10k（一次性 runner，brew 自带校验，未逐个查公告，不进入产品依赖）；`apt-get install fish zsh`。
- GitHub Actions：沿用 `ci.yml` 的 checkout `3d3c42e…`、setup-node `8207627…`；新增 `actions/upload-artifact` v7.0.1（`043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`，2026-04-10 发布，距今 > 14 天；v7.0.2 发布于 2026-10-07 不满 14 天未用；`gh api advisories` 查该 action 无公告）。
- 未改仓库其他文件；`.github/workflows/spike-k6.yml` 为新增。根检查已忽略 `spikes/`。

## 清理确认

- 所有沙箱在 `$TMPDIR/runyard-k6-*`，进程退出时删除；中断后检查：无残留目录，`pgrep -f "k6probe|runyard-k6|run.mjs"` 为空。临时 `.app` 每次用完在 `finally` 中删除。`sleep 15.13`、`sleep 17.7`、`sleep 3.11` 的残留经 `pgrep` 核实为 0。
- 第一次 `.app` 探针因读 `~/Desktop` 卡住（TCC 权限等待），我手动结束了自己启动的 `k6probe` 与其子 node 进程；其间没有点击任何系统弹窗。
- 没有修改任何真实 dotfile（只读复制到临时目录做 `zprof`，随后删除）；没有触碰 `~/Runyard`、`~/.runyard`；没有全局安装。
