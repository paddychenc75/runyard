# 证据 0008：运行输出走管道，日志怎样才干净（K4）

对应决策记录：[0008](../decisions/0008-log-capture-and-cleaning.md)。本文自成一体，记录 M0a 技术验证 K4 的问题、测量、判定和采用的做法。

## 1. 问题

技术设计 §4.4 末段和附录 A 第 1 行裁决：运行的输出走管道，不走伪终端。在 Windows 上，输出转成 `runyard logs` 的纯文本之后：

1. 有没有控制字符残留？
2. 中文会不会乱码？
3. 输出会不会被整块延迟？

通过标准原文：日志里没有控制字符残留；中文不乱码；输出不被整块延迟。退路原文：逐个工具加环境变量或参数；个别工具做不到就在模板说明里写明。

## 2. 环境

| 标记 | 系统 | 说明 |
| --- | --- | --- |
| Windows | GitHub `windows-2025` 运行器（Windows Server 2025，10.0.26100，管理员账户） | 系统区域 en-US；`chcp` 437；控制台输出编码 IBM437；ANSI 代码页 1252，OEM 代码页 437；PowerShell 默认编码 Windows-1252。**这不是中文 Windows 11**，Defender 按 CI 配置 |
| macOS | `macos-26`（arm64） | 基线 |
| Linux | `ubuntu-latest` | 基线 |

工具版本：Node 24.21.0；pnpm 11.28.0（Windows 上是 `pnpm.cmd` 垫片）；Python 3.12.10（`python`）和 3.14.7（`py -3`）；uv 0.13.0；Go 1.26.8；Vite 8.3.1；Next 16.3.6；React 19.3.0。

“默认档”：环境以用户登录环境为底，**去掉** `CI`、`GITHUB_ACTIONS`、`NO_COLOR`、`FORCE_COLOR`、`TERM`、`PYTHON*` 等会改变输出的变量（否则运行器的 `CI=true` 会让工具以为自己在 CI 里）；子进程 `windowsHide`、不继承控制台，与将来管理进程的启动方式一致。

数据来源：运行 38165029567 为主（三个系统，每个系统普通路径加中文路径两轮）；运行 38166322203 是只加了清理诊断的同一代码的重复；运行 38163917766 是更早一版（没有批量用例）。三次运行的 Windows 结论一致。负责人的 Mac 只用来开发测试程序，不作为结论依据。

重复次数：语言探针的 `hello`（默认档、推荐档）、`tick`（一秒一行，每行 6 次）、紧凑交错各 3 次；Vite、Next 每个环境变量档位只跑 1 次（单次，数字不是统计值）；其余 1 次。

## 3. 做了哪些实验

1. 清洗规则的离线自检，18 条，三个系统全过：颜色、光标、清屏、OSC 8 超链接（BEL 和 ESC `\` 结尾）、CRLF、CR 与 LF 被拆在两个数据块、`\r` 重画、`ESC[1G`、汉字的 UTF-8 字节被拆开、转义序列被拆开、GBK 字节流、同一流里 UTF-8 行与 GBK 行交替、GBK 汉字被拆开、无结尾换行的半行、BOM、stdout 与 stderr 半行互不串。
2. 语言探针 `hello / symbols / error / progress / tick / interleave / bulk / hang`，用 Node+TS（`node prog.ts`）、Python（`python`、`py -3`、`uv run`）、Go（`go run`）。
3. Vite 8 dev（`node vite.js`，不经 pnpm）：启动、建立 HMR 的 WebSocket、改文件触发一次 HMR、写入带中文的语法错误并请求；9 个环境变量档位。
4. Next 16 dev（Turbopack）：启动、首次编译、改文件、语法错误；同样 9 个档位。
5. `pnpm install --frozen-lockfile`（经 `pnpm.cmd` 加 `cmd.exe /d /s /c`）：8 个档位。
6. Windows 自带工具：`cmd /c echo 中文`、`chcp 65001`、PowerShell 输出。
7. 中文路径：整个工作目录放在 `...\运行场 测试\项目 一`，重跑启动、编码、崩溃、Vite、Next。
8. 模拟中文 Windows：运行器不能改系统代码页（要管理员权限加重启），所以用 `PYTHONIOENCODING=gbk` 让 Python 往管道写 GBK 字节，检验检测与解码。这只证明“我们的解码器对 GBK 字节有效”，**不证明**真实中文 Windows 上各工具的行为。

## 4. 结果

### 4.1 控制序列（默认设置下管道里有什么）

| 工具 | Windows 默认 | 加 `NO_COLOR=1` | 加 `FORCE_COLOR=1` | 其他档位 | 结论 |
| --- | --- | --- | --- | --- | --- |
| Vite 8 | 颜色码 137 个（Windows 上 picocolors 不看是否终端，直接上色）；macOS、Linux 默认 68 个 | **仍剩 68 个**：报错代码框由 Rust 原生代码（oxc）直接带颜色输出，不认 `NO_COLOR` | 127 | `FORCE_COLOR=0`、`CI=1`、`TERM=dumb` 在 Windows 上都没去掉颜色（127 个，与 `FORCE_COLOR=1` 相同：picocolors 把字符串 "0" 当真值）；`--no-color` 让 Vite 报 “Unknown option --color” 后退出 | 去不掉，必须剥 |
| Next 16 | 颜色码 26 个 | 仍剩 26 个（报错代码框） | 58 | `FORCE_COLOR=0`、`CI=1`、`TERM=dumb` 同样无效；`--no-color` 报 unknown option 退出；macOS、Linux 另有 `ESC[?25h`（显示光标） | 去不掉，必须剥 |
| pnpm 11 | 非终端下是追加式输出，无颜色、无 `\r`；Windows 多一个前缀 “`.../Local/Temp/... \| Progress`” 和 “更新可用” 提示 | 无 | 78 | `--reporter=append-only` 与默认一致；`--reporter=silent` 输出为空（装失败时也没有信息，不建议） | 默认即干净 |
| Node+TS | 无 | 无 | 14 个（`console.log` 对象着色） | — | 干净 |
| Python 3.12 | 无（3.13 起的彩色回溯需要终端或 `FORCE_COLOR`） | 无 | 3.12 无；`py -3`（3.14.7）回溯带 32 个颜色码 | — | 用 `NO_COLOR` 或不设 `FORCE_COLOR` |
| Go | 无 | 无 | 无 | — | 干净 |

换行：Windows 上 Python 的 `print` 写出 CRLF（即使是管道），Node 的未捕获错误堆栈 12 行 CRLF、`console.log` 是 LF，Go 是 LF，cmd 和 PowerShell 是 CRLF。`\r` 重画进度（`progress` 探针）三种语言都原样出现 6 个孤立 `\r`。

### 4.2 编码

| 情形（Windows，默认档） | 结果 |
| --- | --- |
| Node、Go | UTF-8，中文和 `✓ ✗ → … 😀 ▲ ⨯` 全部正确 |
| Python 3.12 / 3.14 / `uv run`，不设变量 | 管道用 ANSI 代码页 cp1252：`print` 中文**直接崩溃** `UnicodeEncodeError`（3 个入口各 3 次，全部崩溃；是脚本死掉，不是乱码；回溯里中文被转义）。崩溃前已打印的行还在 |
| 加 `PYTHONUTF8=1` | 正确 |
| 加 `PYTHONIOENCODING=utf-8`，或 `-X utf8` | 正确 |
| `PYTHONIOENCODING=gbk`（模拟中文 Windows 的 936） | Python 写出 GBK 字节，测试程序的“先严格 UTF-8、失败回退 GB18030”按行识别并解码成功（hello 3 行回退，中文无误）；`✓` 等符号 GBK 里没有，Python 仍会崩溃（`symbols` 档），这是真实现象，设了 `PYTHONUTF8=1` 就没有 |
| `cmd /c echo 中文测试` | 输出 `????`：数据在 cmd 解析命令行时已丢（控制台代码页 437），`chcp 65001` 也救不回 |
| PowerShell `Write-Output '中文测试'` | `????`；先设 `[Console]::OutputEncoding=UTF8` 才得到 UTF-8 |

### 4.3 缓冲（一秒一行，6 行，每个配置 3 次；“延迟”= 到达时刻减程序打印时刻）

| 配置 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Node | 最大延迟 4 ms，最大到达间隔 1016 ms，6 批 | 3 ms / 1008 | 5 ms / 1002 |
| Go（`go run`） | 最大间隔 1001 ms，6 批 | 1013 | 1001 |
| Python 默认（先排除编码崩溃：`PYTHONUTF8=1`） | **6004 ms，1 批到达（全部攒到退出时）** | 6243 | 6002 |
| `python -u`、`PYTHONUNBUFFERED=1`、推荐档 | 延迟 ≤1 ms，最大间隔 1001 ms，6 批 | 间隔 1078–1183（运行器时钟与进程时钟有偏差，延迟数字不可信，间隔可信） | 1001 |
| `uv run`、`py -3` | 与 `python` 一致：默认攒块，加变量后逐行 | 同 | 同 |

stdout 与 stderr 的先后（`seq N out|err` 交替）：间隔 50 ms 时，Node、Go 以及 `python -u` 顺序完全正确（0 次倒序）；Python 默认缓冲时 20 行里 10 次倒序（stdout 被攒住，stderr 先到）。**无间隔的紧凑写入（400 行）时，三种语言即使无缓冲也有 75–200 次倒序**：两根管道之间没有全局顺序，任何走两根管道的方案都一样。日志按到达顺序合并，这是已知上限，不是 Windows 特有。

### 4.4 崩溃与强杀会不会丢最后几行

| 用例 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Node `hang`（打印 5 行后被强杀） | 5/5 行在 | 5/5 | 5/5 |
| Go `hang`（`go run`，杀整棵树） | 5/5 | 5/5 | 5/5 |
| Python `hang`，默认缓冲 | **0/5 行**（强杀，缓冲区丢光） | 0/5 | 0/5 |
| Python `-u` / `PYTHONUNBUFFERED=1` | 5/5 | 5/5 | 5/5 |
| 2 万行批量后“硬退出”（Node `process.exit`） | 20000/20000 | 20000/20000 | **只收到 308 行（丢 19692）** |
| 同上，Python `os._exit`，默认缓冲 | 收到 19871（丢 129）；`py -3` 丢 1729 | 丢 1035 | 丢 10 |
| 同上，Python 无缓冲 / Go | 全收到 | 全收到 | 全收到 |
| 回溯 / 崩溃时的最后几行（`error` 探针） | 全在，stderr 与 stdout 都有 | 全在 | 全在 |

Linux 上 Node 在写大量数据后立即 `process.exit()` 会截断管道输出（运行器上 1 次，未重复）；Windows、macOS 没出现。这是 Node 的已知行为，与本设计无关。

### 4.5 大批量与块边界

2 万行、每行带 `ESC[32m ... ESC[0m` 和中文（约 789 KB，4 万个颜色码）：三个系统、三种语言，**收到的行全部完整，0 行损坏，0 个 U+FFFD，0 个控制字符残留**。清洗 789 KB 约 30–45 ms（Node 单线程，GitHub 运行器）。真实运行中数据块边界落在汉字或转义序列中间的次数：Windows 上 `py -3` 的批量用例出现 1 次汉字被拆、1 次转义序列被拆；Linux 上 Node 1 次，其余为 0。因为规则是“先按 0x0A 切行再解码”，这几次没有造成损坏，另有 18 条自检用合成数据覆盖拆分。

### 4.6 Vite、Next、pnpm 在 Windows 上的完整链条

| 项 | Windows 结果 |
| --- | --- |
| Vite 启动到 “Local:” 行 | 约 0.31–0.42 s |
| 改文件后 HMR 行到达 | 约 51–64 ms（首次 1014 ms，含依赖优化） |
| Vite 语法错误 | 请求返回 500，日志里有带中文的代码框；标记 4/4 |
| Next 启动到 “Ready” 行 | 约 0.47–0.53 s；首个请求 200，改文件后 200，语法错误 500，错误日志带中文代码框；标记 3/3 |
| Next 的遥测提示 | 默认档输出一段 “Attention: Next.js now collects ...”，`NEXT_TELEMETRY_DISABLED=1` 后没有 |
| 停止后 | 端口全部关闭（所有 Vite、Next 用例 `portStillOpenAfterStop=false`）；Windows 上 `taskkill /T /F`，退出码 1 |
| pnpm 经 `pnpm.cmd` 加 `cmd.exe` | 输出无损，中文路径下正常 |

所有用例的纯文本：残留控制字符行 0，U+FFFD 行 0（含 `PYTHONIOENCODING=gbk` 的解码用例）。

### 4.7 中文路径

三个系统的 `...\运行场 测试\项目 一`：Node、Go、Python（设 UTF-8 变量后）、Vite（启动、HMR、错误）、Next（启动、编译、错误）全部正常，标记全中；Python 默认档的崩溃与普通路径一致，与路径无关。

## 5. 对照通过标准

| 标准 | 判定 | 证据 |
| --- | --- | --- |
| 日志里没有控制字符残留 | **通过（条件：存储未清洗的整行（切行加解码）、读取时按规则清洗）**。**不通过的是“靠环境变量避免控制序列”**：Vite、Next 的报错代码框无论怎么设都带颜色码，必须剥 | 全部 Windows 用例清洗后残留行 0；原始流里 Vite 剩 68 个、Next 剩 26 个颜色码去不掉；2 万行 4 万个颜色码清洗后 0 损坏 |
| 中文不乱码 | **有条件通过**：Node、Go、Vite、Next、pnpm 在运行器上天然是 UTF-8；Python 在非中文区域的 Windows 上不设变量就崩溃，设 `PYTHONUTF8=1` 后全部正确；GBK 流的识别解码在模拟下可行。**中文区域（代码页 936）的真实表现未验证** | 4.2 |
| 输出不被整块延迟 | **Node、Go、Vite、Next、pnpm 通过；Python 默认不通过，加 `PYTHONUNBUFFERED=1` 后通过** | Python 默认 6004 ms 一批到达，加变量后 ≤1 ms；强杀时默认丢光所有缓冲行 |

“管道，不是伪终端”的裁决在日志质量上**成立**（在运行器上，Vite、Next、Node+TS、Python、uv、Go、pnpm 经管道都得到可读、完整、不乱码的日志）；代价落在三件已知、可处理的事上。

## 6. 采用的做法

### 6.1 环境变量（所有系统都加，不只 Windows）

| 变量 | 对象 | 原因 |
| --- | --- | --- |
| `PYTHONUTF8=1` | Python / uv | 防编码崩溃 |
| `PYTHONUNBUFFERED=1` | Python / uv | 防整块缓冲和强杀丢行 |
| `NEXT_TELEMETRY_DISABLED=1` | Next | 关遥测提示 |
| 强制颜色（`FORCE_COLOR=1`） | 全部 | 界面保留颜色，读取时再剥；用 `NO_COLOR=1` 清洗结果相同，但仍必须清洗 |
| 不设 `CI=1` | 全部 | pnpm 据此改变默认行为（如 frozen lockfile） |

可选：`PYTHONIOENCODING=utf-8`。不需要 `-u`（`uv run` 下 `-u` 要写在 `python` 之后）。Vite 加 `--clearScreen false`（避免清屏序列，规则也能剥）。`--no-color` 对 Vite、Next 不可用，不要传。`pnpm install` 不用 `--reporter=silent`。

### 6.2 日志清洗规则（读取时执行；已被 18 条自检和批量用例验证）

1. 两路各自累积字节，按 0x0A 切成整行；半行留到下一块或进程结束时输出。
2. 行尾去掉一个 `\r`（CRLF）。
3. 每行先严格按 UTF-8 解码，失败则按 GB18030（含 GBK）解码。
4. 去掉开头的 BOM。
5. 把 `ESC[1G`、`ESC[G`、`ESC[0G`（光标到第 1 列）当成 `\r`。
6. 剥掉 OSC（含 OSC 8 超链接，以 BEL 或 `ESC \` 结尾；未结束的吃到行尾）、DCS/SOS/PM/APC、CSI（颜色、光标、清屏、私有模式）、`ESC` 加一个字符、8 位 CSI。
7. 行内多个 `\r` 只留最后一段非空内容；`\b` 删掉前一个字符。
8. 删除剩余的 C0 控制字符（保留 `\t`）、DEL、C1。
9. 清洗前非空、清洗后为空的行（纯控制序列）丢弃；原本的空行保留。

```
for each pipe (stdout, stderr) separately:
  buffer += chunk
  while buffer has 0x0A: line = cut(buffer); emit(clean(line))
  at process end: emit(clean(rest of buffer))
clean(bytes): s = decode(bytes) // UTF-8 strict, else GB18030
  s = stripOneTrailingCR(s); s = stripBOM(s); s = replaceColumn1WithCR(s)
  s = stripEscapeSequences(s); s = keepLastNonEmptySegmentAfterCR(s); s = applyBackspace(s)
  s = deleteControlChars(s)            // keep \t
  return (original nonEmpty && s empty) ? DROP : s
```

已知限制：多行重画（`ESC[1A` 配合 `ESC[2K` 往上改前几行）无法还原，只会留下每个状态；GBK 字节碰巧也是合法 UTF-8 时（极少数）会被当 UTF-8；两根管道之间没有全局顺序。

### 6.3 每个工具的推荐

| 工具 | 环境变量 | 参数 | 要写进模板说明的 |
| --- | --- | --- | --- |
| 全部 | 见 6.1 | 无 | — |
| Python / uv | `PYTHONUTF8=1`、`PYTHONUNBUFFERED=1` | 不需要 `-u` | 子进程里自己启动的 Python 会继承变量；脚本里 `os._exit` 之类硬退出在无缓冲下也不丢 |
| Vite | 同全部 | `--clearScreen false` | 报错代码框颜色去不掉；`--no-color` 不可用 |
| Next | `NEXT_TELEMETRY_DISABLED=1` | 无 | 报错代码框颜色去不掉；`--no-color` 不可用；Linux、macOS 退出时会输出 `ESC[?25h` |
| Node+TS、Go | 无需 | 无 | 干净；Linux 上 Node 的 `process.exit()` 紧跟大量输出可能截断（Node 的行为） |
| pnpm install | 默认即可 | 无 | 非终端下已是追加式、无颜色 |

## 7. 接受的风险与限制

- 颜色去不掉：靠清洗解决，清洗是必需的一环，不是可选项。
- 两根管道之间没有全局顺序：紧凑写入时有倒序；文档不承诺 stdout 与 stderr 的严格先后。
- 多行重画无法还原。

## 8. 没有验证的

- 中文区域 Windows（代码页 936）的真实表现：Python 不设变量的实际字节（预期 GBK）、`go run`、`node`、`pnpm.cmd`、`cmd` 内置命令、PowerShell 5.1 的输出编码。只在 cp1252/437 上测过，GBK 只是模拟。
- 启用“使用 Unicode UTF-8 提供全球语言支持”（代码页 65001）的机器。
- 真实用户机器上 Defender 等杀毒软件对管道吞吐和启动时间的影响；Windows 11 家庭版与企业版的差别。
- 从桌面应用（Electron）实际启动管理进程后再起子进程的链路：本次由 Node 直接启动，等价于无控制台的 `windowsHide`，但不是 Electron 打包环境。
- 真正的 Vite 浏览器端 HMR（本次用 Node 的 WebSocket 模拟）。

## 9. 需要在负责人的 Windows 真机（中文 Windows 11）上做的验证

对应上面第 8 节的前四项，在预览版发布前做：代码页 936 下各工具的输出编码；代码页 65001 的机器；有杀毒软件时的管道吞吐；打包后的应用拉起管理进程再起子进程。浏览器端 HMR 可以更晚。

## 10. 依赖和查过的内容

- 测试夹具不提交 `package.json` 和锁文件：依赖审查对 `next@16.3.6` 报了高危 GHSA-cjq9-62q9-8jv4（图片优化 SSRF），对 Vite 夹具锁文件里的间接依赖 `source-map-js@1.2.1` 报了高危 GHSA-68fv-2mgg-jv7q（事件循环拒绝服务），仓库里不许出现带高危公告的版本。测试程序在一次性运行器的临时目录里现装精确版本（仍受 14 天年龄规则约束）。因此间接依赖按“满 14 天的最新版”解析，可能带已知公告；只在一次性运行器上、绑定 `127.0.0.1`。结果各节的数据是改动之前用已提交的锁文件测得的，仍然有效。
- 安装的包：`vite 8.3.1`（发布 17 天；8.3.2 为 10 天被年龄规则挡住）、`@vitejs/plugin-react 6.1.1`（44 天）、`react`、`react-dom 19.3.0`（32 天）、`next 16.3.6`（19 天）。`next 16.3.6` 有 6 条公告（修复在发布不满 14 天的 16.3.7、16.3.8）；本实验只在一次性运行器上跑 `next dev`，绑定 `127.0.0.1`，不用图片优化，因此接受，没有绕过年龄规则。
- CI 用的 Action 均固定完整提交哈希且发布满 14 天：`actions/setup-python v7.0.0`、`actions/setup-go v7.0.0`、`astral-sh/setup-uv v10.2.0`、`actions/upload-artifact v7.0.1`。

## 11. 清理核对

每个用例结束后核对端口和进程。运行 38165029567：Windows 主轮 253 个进程、macOS 194、Linux 194，残留 0；中文路径轮有 1 个 Windows pid 显示“存活”。运行 38166322203（同一代码加了诊断）的 Windows 普通轮有 2 个：诊断显示这些 pid 当时是 `WmiPrvSE.exe`、`smartscreen.exe`，而我们当初启动的是已退出的 `py.exe`、`uv.exe`，是 Windows 把 pid 复用给了别的进程，不是残留。这件事与 K2 记录的“Windows 上必须同时核对进程创建时间，不能只信 pid”是同一类现象（决策记录 0006）。

## 12. 证据

- GitHub Actions 运行：[38165029567](https://github.com/paddychenc75/runyard/actions/runs/38165029567)（主）、[38166322203](https://github.com/paddychenc75/runyard/actions/runs/38166322203)（重复）、[38163917766](https://github.com/paddychenc75/runyard/actions/runs/38163917766)（更早一版）。
- 合并的 PR：[#2](https://github.com/paddychenc75/runyard/pull/2)。
