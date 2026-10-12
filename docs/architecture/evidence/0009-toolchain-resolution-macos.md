# 0009 的依据：macOS 上图形应用怎样找到用户终端里的那套工具

本文是决策记录 [0009](../decisions/0009-toolchain-resolution-macos.md) 的完整依据。技术验证 K6（macOS 部分）的实验代码已经删除，结论、数字和算法都在这里。Windows 部分（商店占位程序、winget 装完不重启就能检测到）不在 K6 的 macOS 范围内，留给负责人的 Windows 真机（技术设计 §11.1 的真机清单）。

## 问题

从 Finder 或 Dock 启动的应用拿不到终端的环境。Runyard 能否向用户的登录 shell 要来环境，找到和终端里**同一个** `node`、`pnpm`、`python`、`uv`、`go`？覆盖 nvm、fnm、Volta、mise、asdf、pyenv、uv、Homebrew、corepack，以及杂乱的启动文件和 fish。

原来的通过标准（技术设计 §11.1）：macOS 上解析出的 node 与终端里一致，2 秒内完成。协调人裁定改写为：**首次解析在典型环境下 ≤ 2 秒；超过时界面不阻塞。** 改写的理由是实测里 2 秒只是典型值，不是保证（见“对照通过标准”）。

## 环境

| 标记 | 内容 |
| --- | --- |
| 本机 | 负责人的 Mac，Apple Silicon，macOS 27.0.1，zsh + nvm（默认别名 24），启动文件有 `_encode/_decode` 杂音。**测量期间机器上还有别的技术验证在跑，负载约 3，计时数字偏悲观** |
| CI macOS | GitHub 的 `macos-26`，Apple Silicon，Homebrew 装了 fish、nvm、fnm、volta、mise、asdf、pyenv、uv、starship、powerlevel10k。一次性机器，启动文件几乎是空的，**耗时不代表真实用户**，只用来验证正确性 |
| CI Linux | `ubuntu-latest`（apt 装 fish、zsh），第二个数据点 |

真实与伪造：本机只有真实 nvm 和真实 Homebrew（只读），其余管理器在本机是假的（行为与文档一致的假可执行文件）。`macos-26` 上装了**真的** nvm、fnm、Volta、mise（hook 与 shims 两种）、asdf、pyenv、uv、corepack（Node 24 自带），用同一套对照比较，所有真实管理器与假实现的结论一致。

对照的做法（地面真相）：在同一个 `HOME` 里用 Python 的 `pty` 开一个**真正的伪终端**，启动 `$SHELL -l`（交互登录，会画提示符、跑 precmd/chpwd 钩子），输入 `command -v X; X --version`。解析器的结果与它逐项比较：路径和版本一致、软链接指向同一文件、终端里是 shell 函数时只比版本、版本错、没找到。“朴素”指不解析，直接用 Finder 的极简 `PATH`；“扫描”指在一组常见安装目录里找。

## 实验和数字

| # | 实验 | 重复 | 结果 |
| --- | --- | --- | --- |
| 1 | 真实 zsh（只读，用户真实 HOME，Finder 式极简环境 `env -i`） | 5 个工具 | 解析 5/5 与终端一致（node 24.21.0、pnpm 11.28.0、python 3.14.3、uv 0.11.7、go 在 gvm 目录）；朴素 0/5；扫描 2/5（node 选了最高版本 v25.6 而不是默认别名 24；go 没找到；pnpm 同路径不同版本） |
| 2 | 模拟 Finder：`env -i` 启动解析器 | 1 | 进程只拿到 8 个变量（HOME、LANG、LOGNAME、PATH、TMPDIR、USER、XPC_FLAGS、`__CF_USER_TEXT_ENCODING`），没有 `SHELL`；登录 shell 由 `os.userInfo().shell` 得到 `/bin/zsh`；解析 0.96 s |
| 2b | 真实 LaunchServices：临时 `.app` 用 `open -W -n` 启动 | 2 种 | **本机 `open` 会把调用者的整个环境（128 个变量）传给被启动的应用**，所以“从终端 `open`”不等于 Finder 启动。让 `open` 自己也用极简环境时应用收到 18 个变量，含 `SHELL=/bin/zsh`、`SSH_AUTH_SOCK`、`COMMAND_MODE`、`__CFBundleIdentifier`，`PATH` 是极简的。两种情形解析都成功（0.9 s、1.2 s），node 24.21.0。真正的 Finder/Dock 双击没有自动化，以 `env -i open` 作为最接近的近似 |
| 3 | 矩阵：15 个合成环境 × zsh/bash（× 有项目版本文件时的 home/项目两个 cwd） | 1 次/格；本机 98 对，CI macOS（含 fish）183 对 | 解析 **98/98（本机）、183/183（CI macOS）**；朴素 4/98、0/183；扫描 60/98（61%）、124/183（68%） |
| 3b | 真实管理器（`macos-26`）：nvm、fnm、Volta、mise activate（zsh/bash/fish）、mise shims、asdf、pyenv、uv python、corepack pnpm；每个 home 与项目两个 cwd | 各 1 次 | 全部与终端一致。fnm 的 multishell 软链接在 shell 被杀后仍然存在；corepack 垫片首次 `pnpm --version` 2154 ms（含下载），之后约 180 到 230 ms |
| 3c | Linux 第二数据点 | 1 次/格 | bash 22/22、fish 9/9 一致；**zsh 的对照在 Linux 上取不到数据（对照脚本的问题，不是解析器的问题），未计入、未验证** |
| 消融 | 去掉预热、钩子、交互 | 本机 62 对，CI 124 对 | CI：完整 124/124；去钩子 121；去预热 120；两者都去 117；只用非交互登录 shell 114（即少 10 对）。README 另记：去掉预热和钩子在本机矩阵里分别掉 4 对和 3 对 |

### 杂乱启动文件（21 种 × zsh/bash/fish；本机与 CI 一致，除注明）

| 情形 | 结果 |
| --- | --- |
| 启动文件前后向 stdout/stderr 打杂音、无换行结尾 | 通过（标记之外的字节全部忽略） |
| 启动文件打印“长得像标记”的文字；变量值含换行和标记前缀 | 通过（每次调用用随机标记；`env -0` 以 NUL 分隔，值里的换行完整保留） |
| `sleep 3`（超过 2 秒预算） | 能解析，3.15 s（本机）/3.29 s（CI），**超出 2 秒** |
| `sleep 15`（超过 10 秒超时） | 10.0 s 后超时，进程组被杀，`pgrep` 核实无残留 `sleep`；回退到扫描 |
| `read` 提示、oh-my-zsh 式 `read -q`、`compinit` 不安全目录提示 | 通过：stdin 是 `/dev/null`，立即得到 EOF，不挂起 |
| `set -u` 引用未定义变量 | 通过 |
| rc 里 `exit 3`；bash 里 `set -e` 加失败命令（用户自己的终端也会被踢出） | 解析失败（没有起始标记）或降级为非交互登录（取不到 rc 里的内容）；这类配置在终端里本身就是坏的 |
| 语法错误 | 终端里错误之后的内容同样不会执行，二者一致 |
| rc 末尾 `exec` 另一个 shell | 本机 zsh 与 bash 互换：命令走 stdin 的第二次尝试成功。CI：node 版本与沙箱预期不同（新的登录 shell 重新加了 brew 路径）——拿到的是被 `exec` 出来的 shell 的环境，与终端用户一致，与登录 shell 声明的不同。`exec fish`：macOS CI 通过；Linux 上 zsh 降级、bash 失败 |
| 后台任务继承 stdout（`(sleep 17.7 &)`） | 通过：看到结束标记就杀进程组，不等管道关闭 |
| 800 KB 的环境变量；5000 个变量 | macOS 通过（134 ms 内）；**Linux 失败**：单个变量超过 128 KB 时 `env` 无法 exec（E2BIG），得到标记齐全但为空的输出。已加“空环境”判定和“只用内建打印 PATH”的备用，但 macOS 上 800 KB 变量本来就能通过，备用路径**没有被真实触发过，未验证**，Linux 也未重测 |
| 非 UTF-8 字节 | 能解析，该值被替换为 U+FFFD 并标记有损（若落在 `PATH` 的目录名上会出错，未见于实测） |
| iTerm2 / VS Code 的 OSC 转义序列、真实 starship、真实 powerlevel10k（先开一次交互会话生成 instant prompt 缓存） | 通过。p10k 是否真的启用了 instant prompt 没有单独核实 |
| rc 里调用 `stty`、`tput`、`tty` | 通过（stderr 报错被忽略） |

### 计时（本机真实 zsh，每项 25 次；机器负载约 3）

| 项 | 中位数 | p95 | 最大 |
| --- | --- | --- | --- |
| 完整解析（登录加交互，预热加钩子） | 985 ms | 1031 | 1042 |
| 同上，不提前结束 | 977 | 1049 | 1076 |
| 去预热和钩子 | 998 | 1234 | 1299 |
| 仅 `-l -c`（不读 `.zshrc`） | 36 | 45 | 48 |
| `zsh -l -i -c exit`（没有我们的命令） | 999 | 1041 | 1065 |
| `zsh -f -c true` | 2 | 3 | 3 |
| 启动一个 `node -e 0` | 26 | 28 | 28 |
| 5 个工具的检测（顺序执行版本命令） | 253 | 256 | 256 |
| 读缓存并比较启动文件 mtime | 0.047 | 0.056 | 0.42 |

- 第一次（冷）是 998 ms，和后面没有区别：系统文件缓存无法可靠清除，“冷”只指进程内第一次，**真正重启后的冷启动没有测**。
- 耗时几乎全是用户的 `.zshrc`（`zsh -lic exit` 就要约 1 s，我们的命令几乎不加时间）。`zprof` 显示大头是 nvm 加载（461 ms）和 `compinit`（447 ms），其次 `cd`（255 ms）。提前结束没有收益。
- 解析加检测约 1.25 s，在本机真实环境下满足 2 秒，余量只有一倍，别人的 `.zshrc` 稍重就会超；因此必须缓存并在后台刷新，界面不能等它。
- 检测应并行（5 个顺序检测占 253 ms）；corepack 垫片第一次可能联网（2 s）。

### 缓存什么时候失效（各 1 次）

| 变化 | 启动文件 mtime 变了吗 | 用旧缓存的结果 |
| --- | --- | --- |
| `nvm alias default 24`（只改 `~/.nvm/alias/default`） | 没变 | **旧**（22.1.0）；重新解析后才是 24.0.0 |
| 往 `PATH` 里已有的目录装新工具 | 没变 | **能找到**（`which` 实时查，不用重解析） |
| 在启动文件里新加 `PATH` 目录 | 变了 | 找不到，重新解析后找到 |

### 按项目目录（各 1 次）

| 做法 | 结果 |
| --- | --- |
| 捕获和检测都用项目目录做 cwd | 全部与终端一致 |
| 捕获用 home、检测用项目目录 | 只有 fnm（`--use-on-cd`）和 mise activate（hook）错：它们在 shell 启动时按 cwd 改 `PATH` |
| 捕获和检测都用 home（全局缓存） | Volta、mise shims、asdf、pyenv、corepack 错：垫片在**执行时**按 cwd 选版本 |
| nvm | 不受 cwd 影响（`.nvmrc` 只有用户另加钩子才自动生效） |

## 对照通过标准

| 标准 | 判定 | 证据 |
| --- | --- | --- |
| macOS：解析出的 node 与终端里一致 | **通过** | 真实 zsh 5/5；矩阵本机 98/98；macOS CI 183/183（含真实 nvm、fnm、Volta、mise、asdf、pyenv、uv、corepack 与 fish）。限制：有两处“一致”依赖我们做了对应处理——懒加载 nvm 要预热，mise hook 要手动跑 precmd；去掉后分别掉 4 对和 3 对 |
| 2 秒内完成（改写前的标准） | **有条件通过**，所以标准改写 | 本机真实环境中位数 985 ms，p95 1031 ms，加检测约 1.25 s；启动文件稍重（实测 `sleep 3`）就超；超过 10 秒会超时。需靠缓存加后台刷新保证界面不等待 |
| 改写后的标准：首次解析在典型环境下 ≤ 2 秒；超过时界面不阻塞 | **通过，但只在作者一台机器上、典型环境的意义上** | 同上。“界面不阻塞”是设计要求（缓存先用旧值、后台刷新），没有用真实界面测过 |
| 含启动文件杂乱输出 | **通过** | 见杂乱启动文件表 |
| 超过 10 秒 | **通过（行为明确）** | 10.0 s 超时，进程组被杀，无残留，回退扫描 |
| shell 是 fish | **通过（CI）** | `macos-26` fish 10/10 对；`ubuntu-latest` fish 9/9 对；本机没有 fish，未在本机测 |
| 回退（常见目录加指定路径）可用 | **部分通过** | 扫描与完整解析一致率只有 61%（本机）/68%（CI）：对 nvm 选错版本，拿不到 mise activate，拿不到懒加载 nvm 的函数。只能作为“超时或失败时先显示点什么”的临时答案，不能当主路径 |

## 决定

采用“向用户的登录 shell 要一次环境”，不为每个版本管理器写专门逻辑，不退到“只靠常见目录”。但原设计只写了“超时 10 秒、失败退回常见目录”，不够：需要交互模式、预热、钩子、stdin 备用、缓存和按项目目录的规则。

### 解析器算法（伪代码）

```
resolveEnv(project?):
  shell = os.userInfo().shell → dscl . -read /Users/$USER UserShell → $SHELL → /bin/zsh
          // 从 Finder 启动时 SHELL 可能缺失
  kind = zsh | bash | fish；其他（nu、tcsh、xonsh…）→ 直接走回退
  base = 进程环境 + RUNYARD_RESOLVING_ENV=1     // 让用户的启动文件能识别并跳过交互内容
  nonce = 8 字节随机；START/END = "__RUNYARD_ENV_<nonce>_START__" / "_END__"
  cmd = [钩子] + [预热] + printf START; /usr/bin/env -0; printf END
    钩子(zsh/bash)：跑 precmd_functions / PROMPT_COMMAND（fish：emit fish_prompt）
                    // mise activate 只在提示符之前改 PATH
    预热：对工具 [node, npm, pnpm, python3, python, uv, go] 逐个：
          command -v 的结果不以 / 开头（是函数）→ 调用一次 --version   // 懒加载 nvm
  尝试顺序（失败且不是超时才试下一个）：
    1. <shell> -l -i -c cmd       stdin=/dev/null，detached（无控制终端），
                                  cwd=项目目录或 home，超时 10 s
    2. <shell> -l -i，把命令写进 stdin            // 穿过 rc 里的 exec 另一个 shell
    3. <shell> -l -i -c "只用内建打印 PATH"       // env 无法 exec（单个变量 >128 KB）
    4. <shell> -l -c cmd                          // 读不到 .zshrc，结果标为“降级”
    全部失败或超时 → 扫描常见目录，界面标“未能读取登录环境”
  只取第一个 START 与其后第一个 END 之间的字节；按 NUL 分割，首个 '=' 切键值；标记之外全忽略
  看到 END 立即杀进程组（只杀自己创建的组），不等管道关闭
  得到的环境既无 PATH 也无 HOME → 视为失败（空环境）
  非 UTF-8：按 latin1 切分再按 UTF-8 还原，标记有损

cache:
  key = (shell, 启动文件 mtime 指纹[, 项目路径 + 版本文件 mtime 指纹])
  TTL 1 小时；应用启动时和每次“重新检测”后台刷新；界面先用旧值，不等待
  // nvm 默认别名变了但启动文件没变，只能靠 TTL 和“重新检测”发现
  // 没有版本文件的项目共用全局缓存

detect(tool, env, projectDir):
  which 手写：按 env.PATH 查（不用 process.env）
  以 projectDir 为 cwd 运行该工具自己的版本命令（go 用 `go version`，其余 `--version`）
  解析版本号；解析不出来就是未安装
```

有版本文件（`.node-version`、`.nvmrc`、`.tool-versions`、`mise.toml`、`.python-version`、`package.json`）的项目，要向 shell 要环境这一步也以项目目录为 cwd 再做一次，缓存键加上项目路径和这些文件的 mtime。

### 来源和失败时的显示

`env.load` 返回环境的同时返回来源：`login-shell`（登录加交互，可信）、`login-shell-degraded`（只读到非交互登录环境）、`path-only`、`fallback`（扫描常见目录）。来源和失败原因是代码，不是句子（技术设计 §5.1）。

- 解析超时或失败：先用扫描结果展示，状态里发提示码 `ENV_UNRESOLVED`（带原因），界面说明“没能读取你终端的环境，可能不准”，附“重新检测”和“指定路径…”，后台再重试一次。
- 降级：发 `ENV_DEGRADED`，同样提示。
- 扫描与解析器不一致时以解析器为准；只在解析器失败时才展示扫描结果，并标明来源。

## 陷阱清单

| 陷阱 | 对策 |
| --- | --- |
| Finder 里没有 `SHELL` | 用 `os.userInfo().shell`，`dscl` 备用 |
| 非交互登录 shell 读不到 `.zshrc`（nvm、fnm、Volta 常写在这里） | 必须 `-i`；只用 `-l` 在 124 对里少 10 对 |
| 懒加载 nvm：`command -v node` 返回函数名 | 预热：调用一次再导出 |
| `mise activate`：PATH 只在提示符前更新 | 手动跑 precmd / `PROMPT_COMMAND` / `fish_prompt` |
| 垫片管理器（asdf、pyenv、Volta、mise shims、corepack）按 cwd 选版本 | 检测命令以项目目录为 cwd |
| fnm `--use-on-cd`、mise activate 在启动时按 cwd 改 PATH | 有版本文件的项目以项目为 cwd 再捕获一次 |
| nvm 默认别名改了但启动文件没改 | 不能只靠 mtime：TTL、后台刷新、“重新检测” |
| rc 里 `exec` 别的 shell 吞掉 `-c` 命令 | stdin 备用尝试 |
| rc 里 `read`、更新提示、`compinit` 提示 | stdin 设为 `/dev/null` 即可，实测不挂起 |
| rc 里 `sleep` 或很慢 | 超时 10 s，杀进程组，回退扫描；不要同步等待 |
| 后台任务占着 stdout 管道 | 看到 END 就杀进程组 |
| 单个环境变量 >128 KB（Linux）使 `env` 无法 exec | 空环境判定加内建打印 PATH 备用（未被真实触发过） |
| Go 没有 `--version` | 工具定义里的检测脚本按工具写（`go version`） |
| `open` 会转发调用者的环境（本机实测） | 测试“从 Finder 启动”不能只用终端里的 `open` |
| 从 LaunchServices 启动的进程读 `~/Desktop` 会弹隐私权限框并一直等待（实验里的探针 `.app` 因此卡住过一次） | 产品里不要在后台悄悄读 Desktop、Documents、Downloads 下的目录；默认资源库 `~/Runyard` 不在这三处；设置里用户选了这三处时给警告 |
| 用户在 `PATH` 之外装了工具（`~/.local/bin` 没进 PATH） | 终端里也找不到；扫描会“多找到”，界面应说明来源 |

## 后果

见决策记录 0009 的“后果”。技术设计里受影响的地方：§4.8（查找方式、何时检查、判定、缓存）、§5.1（提示码）、§6（设置里的资源库位置警告）、§7.1（`env.load`）、§7.2 第 9、10 行、§11.1 的 K6 行。

## 接受的风险

- 用户的启动文件有 `exit`、`set -e` 加失败命令这类在终端里本身就坏的配置：解析失败或降级，界面提示，不修。
- 在被 `exec` 出来的 shell 里才设置 PATH 的用户，拿到的是被 `exec` 出来的 shell 的环境（与终端一致，与登录 shell 声明的不同）。
- nu、tcsh、xonsh 等 shell 直接走回退，靠“指定路径…”。
- 扫描只是临时答案，一致率 61% 到 68%。

## 没有验证的

- 真正的 Finder/Dock 双击启动（只用 `env -i open` 近似；真正的 launchd 的 `PATH` 是否恰为 `/usr/bin:/bin:/usr/sbin:/sbin` 未实测）。
- 别人的重型 `.zshrc`（oh-my-zsh 全家桶、conda init、pyenv 全家桶、1Password/ssh-agent 钩子）；重启后的真正冷启动。
- 只在被 `exec` 出来的 shell（`exec fish`、`exec nu`）里才设置 PATH 的用户。
- powerlevel10k instant prompt 是否真被激活。
- nu、tcsh、xonsh 等 shell。
- fnm multishell 软链接在多日之后是否被清理（实测 shell 被杀后仍在）。
- Linux 的 zsh 对照；Linux 上 800 KB 变量的备用路径。
- 企业环境（MDM 改写的 `/etc/zprofile`、目录服务账户的 shell）。
- 本机没有 fish，fish 只在 CI 上测过。
- 真实重启后的冷启动耗时；真实界面在后台解析期间不阻塞（设计要求，未用界面测）。

## 需要负责人在自己的 Mac 上看一次

- 从 Finder 或 Dock 双击启动已打包的应用（不是从终端 `open`），打开一个 Node 模板，确认找到的 node 和终端里 `which node` 是同一个。
- 设置里把资源库位置改到“桌面”“文档”“下载”之一，确认出现警告；默认 `~/Runyard` 不应触发 macOS 的隐私权限弹窗。
- 自己 `.zshrc` 较重时，“运行环境”里首次出现结果要多久；界面是否一直可用。

## 需要在 Windows 真机上做的

K6 的 Windows 部分（本次未做）：干净系统上，打开 Python 和 Go 模板，照提示用 winget 安装，点“重新检测”，确认不重启就能检测到；确认微软商店的 `python.exe` 占位程序被判为未安装。

## 证据

- 合并的 PR：#1（`docs(spikes): K6 macOS 找工具链的技术验证`）。
- GitHub Actions：第二轮 https://github.com/paddychenc75/runyard/actions/runs/38164928497（成功，`macos-26` 与 `ubuntu-latest`）；第一轮 https://github.com/paddychenc75/runyard/actions/runs/38163481092 因消融太慢被取消，没有数据。
- 依赖：实验零依赖，只用 Node 内置模块；CI 里用 Homebrew 和 apt 安装的管理器是一次性机器上的对照物，不进入产品依赖。
- 清理：沙箱都在临时目录并在退出时删除；`sleep` 残留经 `pgrep` 核实为 0；没有修改任何真实 dotfile，没有触碰 `~/Runyard` 和 `~/.runyard`。
