# 0006 的证据：停止整棵进程树并释放端口（K2）

对应决策记录 [0006](../decisions/0006-stop-process-tree.md)。本文是技术验证 K2 的完整依据，实验代码已不在仓库里，数字都来自当时的实验报告。日期 2026-10-12。

## 问题

运行的输出走管道、不走伪终端时，停止一个运行能否做到：残留进程为 0；停止后 3 秒内端口可重新绑定（两个系统同一个标准）；强杀之后的下一次启动不因残留的锁文件失败。

## 环境

| 环境 | 系统 | 机器 | 工具 |
| --- | --- | --- | --- |
| 负责人的 Mac | macOS 27.0.1，arm64 | Apple M3 Max 16 核 | Node 24.21.0、pnpm 11.28.0、Go 1.26.2、uv 0.11.7 |
| `macos-26` | arm64，3 核虚拟机 | GitHub 托管 | Node 24.21.0、pnpm 11.28.0、Go 1.26.8 |
| `windows-2025` | Windows Server 2025 Datacenter 10.0.26100，x64 | 4 核虚拟机，管理员账户 | 同上，编译器 MinGW-w64 gcc 15.2.0 |
| `ubuntu-latest` | Ubuntu 24.04，x64 | 4 核虚拟机 | 同上；Linux 不是支持的系统，只用来印证 POSIX 这条路 |

Windows 的结果来自服务器版、管理员账户、按 CI 配置的 Defender，只是用户的 Windows 11 的近似。框架版本：Vite 8.3.1、React 19.3.0、Next 16.3.6、Nuxt 4.5.2 和 3.21.11、Vue 3.5.43、Hono 4.13.9。

## 做了什么

八个运行器：`static`、`vite`、`next`、`nuxt4`/`nuxt3`、`node-ts`、`python`、`go`、`hono`。命令是参数数组，输出走管道，只绑定 `127.0.0.1`，同一项目每次用同一个端口（最严的考法）。

| 场景 | 做法 | 每个运行器、每种办法的次数 |
| --- | --- | --- |
| 起停 | 启动，等 `GET /` 回 200，停止 | 50（对比用的办法 15，伪终端 5） |
| 请求进行中 | 就绪后开一个 10 秒才回的请求和一条空闲长连接，再停止 | 5（对比 3） |
| 启动中途停止 | 在典型就绪时间的 10%、30%、50%、70%、90% 处停止，随后马上正常启动一次 | 5 |
| 强制结束（POSIX） | 整组 SIGKILL，随后马上启动 | 10 |
| 中断信号（POSIX） | 用 SIGINT 代替 SIGTERM | 10 |
| 安装中途停止 | 新目录 `pnpm install --prefer-offline`，在完整安装耗时的 25%、50%、75% 处停止，原样重装，再起停一次 | 3（有依赖的五个） |
| 进程树对比 | `pnpm exec vite`、`node --watch`、`uv run` | 5 |
| 对照组 | `orphan`（中间进程退出，孙进程留在组里）、`escape`（孙进程另起会话） | 3 |

静态页面由管理进程自己托管、不起进程；进程内托管（`static-inproc`）关服务并断开所有连接后，端口 0 到 2 ms 可重绑（200 次）。

停止办法：`group`（POSIX，整组 SIGTERM，最多等 3000 ms，再整组 SIGKILL）；`taskkill`（`taskkill /PID <pid> /T /F`）；`taskkill-obs`（同上，但整棵树放进一个不带“关闭即杀”的 Job Object，只为拿成员表当权威答案）；`job`（辅助程序 `runyard-job.exe` 建带“关闭即杀”的 Job，停止 = 结束它）；`job-ctrlc`（辅助程序另开隐藏控制台，向它发 Ctrl+C，3000 ms 没退再结束整个 Job）；`pty-ctrlc`（node-pty 1.1.0 伪终端里写 Ctrl+C，只为对比）。

怎么查残留：从启动起持续采样进程表，记下根进程全部后代（pid 加启动时间）；给子进程环境放唯一标记，停止后在整机找带标记的进程（macOS 用 `ps -E`，Linux 读 `/proc`）；找命令行或工作目录里出现临时目录的进程；试绑端口。Windows 读不到别的进程的环境变量和工作目录，所以另加 `taskkill-obs` 和“绑不上时用 `netstat` 找监听者”。

辅助程序：170 行 C，18 432 字节，只依赖 `KERNEL32.dll` 和系统通用 C 运行库。

## 结果

### 残留进程和端口（不含对照组；停止次数是所有场景之和）

| 环境 | 办法 | 停止次数 | 有残留 | 升级为强杀 | 端口可重绑 ms（中位 / p95 / 最大） | 超过 3 秒 |
| --- | --- | --- | --- | --- | --- | --- |
| 负责人的 Mac | `group` | 900 | 0 | 0 | 16 / 17 / 49 | 0 |
| `macos-26` | `group` | 900 | 0 | 0 | 16 / 21 / 99 | 0 |
| `ubuntu-latest` | `group` | 900 | 0 | 0 | 15 / 18 / 233 | 0 |
| `windows-2025` | `taskkill` | 630 | 0 | — | 68 / 89 / 123 | 0 |
| `windows-2025` | `taskkill-obs` | 162 | 0（Job 成员表也是 0） | — | 67 / 86 / 96 | 0 |
| `windows-2025` | `job` | 630 | 0 | — | 23 / 31 / 33 | 0 |
| `windows-2025` | `job-ctrlc` | 162 | 0 | 6 | 24 / 517 / 534 | 0 |
| `windows-2025` | `pty-ctrlc` | 72 | 0 | 0 | 24 / 508 / 528 | 0 |

端口每 15 ms 试绑一次，16 ms 上下就是“立刻”。500 ms 那一档全是 Python（收到 Ctrl+C 后要等自己的轮询周期）。按运行器分开，没有哪一格超过 233 ms。所有运行器的停止里，根进程退出后 1 秒内都收到了管道的 `close`；只有对照组 `escape` 每次都占着管道。

### 停止之后的下一次启动

| 场景 | 系统 | 结果 |
| --- | --- | --- |
| 启动中途停止后再启动 | 三个系统，全部运行器和办法 | 每格 5/5 成功 |
| 整组 SIGKILL 后再启动 | macOS、Linux，九个项目 | 每格 10/10 成功 |
| 每次起停都是强制结束 | Windows，`taskkill` 和 `job` | 每个运行器 49/49 次“上一次被强杀后的启动”成功 |
| 安装中途停止后原样重装 | 三个系统，vite、next、nuxt4、nuxt3、hono | 每格 3/3 成功，重装后启动 3/3 成功 |

`.next`、`.nuxt`、`node_modules/.vite`、`node_modules/.cache` 被强杀后都没有挡住下一次启动。重装时没设 `CI` 变量，pnpm 没停在确认提示上。安装中途停止时 `node_modules` 有时已建了一半（本机 15 次里 7 次），重装照样成功。

### 每个运行器起了哪些进程

| 命令 | macOS、Linux | Windows（另有一个 `conhost.exe`） |
| --- | --- | --- |
| `node node_modules/vite/bin/vite.js` | 1 个 | 1 个 |
| `pnpm exec vite` | 3 个（pnpm、vite、pnpm 的看门 `sh`） | 4 层 4 个：`cmd.exe`、node（pnpm）、`cmd.exe`、node（vite） |
| `next dev` | 2 个；退出时另起 `detached-flush.js` | 2 个 |
| `nuxt dev`（4 和 3 相同） | 4 个 | 4 个 |
| `node main.ts`、Hono | 1 个 | 1 个 |
| `node --watch main.ts` | 2 个 | 2 个 |
| `python -u main.py` | 1 个 | 1 个 |
| `uv run main.py` | 2 个 | 2 个 |
| `go run .` | 2 个（编译期间最多 10 个） | 2 个（编译期间最多 6 个） |

直接用 node 跑 Vite 入口让 Windows 上的树从 4 层降到 1 层；两种写法用 `taskkill` 和 `job` 都停得干净（各 5 次，残留 0）。`go run` 不是孤儿问题：POSIX 上子程序和 `go` 同组；Windows 上 `taskkill /T` 顺着父进程号找得到（50 次残留 0，Job 成员表核对 15 次也是 0）。

### 伪终端加 Ctrl+C 比强制结束好多少

| 比较 | `taskkill`（强制） | `job-ctrlc`（管道，Ctrl+C） | `pty-ctrlc`（伪终端，Ctrl+C） |
| --- | --- | --- | --- |
| 端口可重绑，中位 | 59 到 86 ms | 18 到 28 ms（Python 517） | 17 到 31 ms（Python 523） |
| 根进程退出，中位 | 59 到 91 ms | 9 到 281 ms（Python 513） | 1010 到 1530 ms |
| 程序有没有机会收尾 | 没有，退出码一律 1 | 有：Next、Nuxt 退出码 0，`go run` 删掉临时目录 | 有，同左 |
| 残留 | 0 | 0 | 0 |
| 代价 | 无 | 一个 18 KB 的 exe | 原生模块进管理进程；每开一次伪终端多一个 `conhost.exe`，到测试程序结束时还在（一个任务里累计 8 到 46 个） |

强制结束在八个运行器上除 `go run` 的临时目录之外没有可见的坏处；优雅退出的好处不用伪终端也拿得到。伪终端每个运行器只测了 8 次。`job-ctrlc` 有 6 次 Ctrl+C 之后 3 秒没退（nuxt4 15 次里 5 次、nuxt3 15 次里 1 次），升级为结束整个 Job，根进程 3.0 到 3.3 秒才退出（端口其实 30 ms 就放开了），说明“等满 `graceMs` 再强杀”在 3000 ms 时会顶到 3 秒线。

### 对照组

- `escape`：POSIX 的进程组每次都漏（9/9），端口和管道一直被占；`taskkill /T /F` 每次都漏（3/3），靠进程树或 `netstat` 才找到；`job` 每次都杀掉（3/3，17 到 19 ms 端口可用）；伪终端也漏（3/3）。
- `orphan`：POSIX 上孙进程还在组里，3/3 杀掉。Windows 上它在停止之前就自己没了：node 的非 detached 子进程会随 node 父进程一起结束。这是推断（libuv 可能把它们放进了一个“关闭即杀”的 Job），没有读源码核实。后果：管理进程崩溃时，它直接启动的运行在 Windows 上很可能跟着结束，macOS 上不会。

## 对照通过标准

| 标准 | macOS | Windows | 证据 |
| --- | --- | --- | --- |
| 残留进程为 0 | 通过 | 通过（`taskkill` 和 `job` 都是） | 负责人的 Mac 900 次、`macos-26` 900 次、Windows `taskkill` 630 次加核对 162 次、`job` 630 次，全部 0 |
| 停止后 3 秒内端口可重新绑定 | 通过，最慢 99 ms | 通过，`taskkill` 最慢 123 ms，`job` 33 ms | 同上；中位 16 ms 和 68 ms |
| 强杀后的下一次启动不因残留的锁文件失败 | 通过 | 通过 | 见“停止之后的下一次启动” |
| 八个运行器各起停 50 次 | 做了 | 做了（`taskkill`、`job` 各 50；`job-ctrlc` 15；伪终端 5） | Next、Nuxt 也是 50 次 |
| 含安装中途停止 | 做了 | 做了 | 每格只有 3 次，次数少 |

Windows 结果只来自 CI 的 Windows Server，不等于用户的 Windows 11。

## 决定的算法

```
停止(run, mode, graceMs):                      # 两个系统都只等 exit 事件，不等管道 close
  若 run.kind 是 static：关掉进程内的服务并断开所有连接；结束

  POSIX（启动时 detached，子进程自成进程组，组号 = 根进程号）：
    信号 = mode 为 interrupt 时 SIGINT，否则 SIGTERM
    kill(-组号, 信号)
    每 10 ms 看一次 kill(-组号, 0)，直到报 ESRCH（组空了）或过了 graceMs
    组还在：kill(-组号, SIGKILL)，再等组空（上限 5 秒）
    试绑端口确认可用；销毁输出管道
    改名、删除之前：在整台机器上找带本次运行标记的进程，等它们走掉（上限 2 秒），还在就结束它们

  Windows 第一版（没有辅助程序）：
    核对根进程还活着，而且 pid 和创建时间都与启动时记下的一致（防 pid 被复用）
    taskkill /PID <根进程号> /T /F
    等根进程的 exit 事件（上限 5 秒）
    试绑端口；绑不上：netstat 找出监听者，核对它创建于本次运行启动之后，结束它，记一条日志
    销毁输出管道

  Windows 有辅助程序时（以后）：
    向辅助程序的标准输入写 "ctrlc"；等它退出，最多 graceMs
    没退：写 "kill"（TerminateJobObject）；再等 2 秒；还不退才直接结束辅助程序
    试绑端口；销毁输出管道
```

`graceMs` 默认 2000。Go 的运行器 `stop.mode` 用 `interrupt`；管理进程给每次运行单独设 `GOTMPDIR`，停止后删掉。

## 生产代码必须处理的边界情况

1. 不要等 `close`，等 `exit`：后代拿着管道写端时 `close` 不来（对照组每次如此）。
2. Next 退出时另起一个脱离进程组的遥测进程（`next/dist/telemetry/detached-flush.js`，设了 `NEXT_TELEMETRY_DISABLED=1` 仍会起）：不占端口，工作目录在项目里，中位活 0.18 到 0.73 秒，最长 0.95 秒（Mac 85 次、`macos-26` 84 次、Linux 88 次都看到）。影响紧接着的改名和删除；强制结束时不会有它。
3. `go run` 被 SIGTERM、SIGKILL 或 `taskkill` 结束时，每次留下一个 `go-build*` 临时目录（三个系统都是）；SIGINT 或 Ctrl+C 时一个不留。
4. Windows 上认后代必须核对创建时间：孩子的创建时间不早于父进程；结束任何进程之前核对它是本次运行启动之后创建的。
5. 辅助程序刚启动就被结束会漏掉子进程：第 4 轮有一次在启动后 13 ms 结束辅助程序，子进程已建出但未放进 Job，`python.exe` 留下（5 次里 1 次）。产品版本要么创建时就指定 Job（`PROC_THREAD_ATTRIBUTE_JOB_LIST`），要么停止一律走标准输入指令。
6. “忽略 Ctrl+C”会从父进程继承：第 1 轮辅助程序发的 Ctrl+C 没人理，因为 CI 执行器让整棵树继承了这个属性；先 `SetConsoleCtrlHandler(NULL, FALSE)` 清掉才生效。管理进程是脱钩启动的，很可能也带着这个属性。
7. Ctrl+C 只能发给同一个控制台上的进程：辅助程序必须先拿到自己的控制台再发，拿不到就不发，否则会打到调用方。脱离控制台的后代收不到。
8. 端口一直绑不上时不要死等：实验上限 8 秒，到时按“原端口被占用”处理（技术设计 §4.5）。
9. 启动后立刻停止（还没建子进程、建组）三个系统都测过，没有问题；辅助程序那条路有第 5 条的竞态。
10. Python 标准库的 `http.server` 在 `macos-26` 上启动要多等 35 秒（绑定时做一次反向域名查询）。与停止无关，但 Python 服务类模板若用它会撞上。

## 一次事故：为什么 Windows 上必须核对创建时间

第 2 轮里 `windows-2025 / nuxt3 / a` 任务在第 44 次起停后，整台 CI 虚拟机再也起不了新进程（退出码 `0xC0000142`），第 3 轮同一任务直接挂死。原因在测试程序：它凭父进程号把进程认作本次运行的后代，而树上的某个进程恰好拿到了一个早已退出的系统进程用过的 pid，于是 `csrss.exe`、`winlogon.exe`、`fontdrvhost.exe`、`dwm.exe` 被当成后代，又在“兜底清理”里当成残留被结束。修法：认后代时核对创建时间，清理时只结束本次运行启动之后创建、且程序名在清单里的进程；修完后第 4、5 轮该任务各 50 次全部干净。只影响 GitHub 的一次性虚拟机。根因是推断的，没有在出事的机器上取证；第 3 轮那次挂死没留日志，是否同一原因未核实。`taskkill /T` 自己是否做了防 pid 复用的核对，本次没有查清。

## 接受的风险与没有验证的

- Windows 的全部数字来自 CI 的 Windows Server（管理员、Server 版、CI 配置的 Defender）。
- 没有验证：Python 虚拟环境；装一个真正大的依赖树到一半；用户自己的 pnpm 仓库被强杀会不会坏（实验用临时仓库）；`react18`、`vue3` 模板（只测了 React 19）；Python 的 `py` 启动器和虚拟环境里的 `python.exe`；`.cmd` 垫片在 Ctrl+C 下的行为（`cmd.exe` 会问“终止批处理操作吗”）；依赖很多、启动很慢的真实项目；同时运行多个项目的互相影响；arm64 的 Windows。“请求进行中”每格 3 到 5 次、“安装中途停止”每格 3 次，次数少。
- `taskkill /T` 会不会因 pid 复用杀错：未查清，所以第一版自己先核对创建时间。

## 需要在负责人的 Windows 真机上复核

1. 普通用户、Windows 11、杀毒开着：`taskkill /T /F` 对 vite、next、nuxt、`go run` 各起停十来次，看残留和端口。（预览版发布前）
2. 强杀之后马上改名、删除项目文件夹，尤其是 Next 和 Nuxt（与 K9 一起）。（预览版发布前）
3. `go run` 在杀毒开着时每次生成新程序的首次扫描耗时，是否让“启动中途停止”更容易留下东西。（可以更晚）
4. 若做辅助程序：未签名 exe 是否被拦（K14）；它另开的控制台会不会闪黑窗口；从 Windows Terminal、VS Code 终端启动的管理进程下 Ctrl+C 是否仍然只打到目标树。（做辅助程序时）
5. arm64 的 Windows。（可以更晚）

## 证据链接

合并的 PR：#4（K2，`test(spikes)`）。GitHub Actions 运行：

| 轮 | 运行 | 内容与结果 |
| --- | --- | --- |
| 1 | [38164000234](https://github.com/paddychenc75/runyard/actions/runs/38164000234) | 每格 6 次；带伪终端的任务跑完不退出挂到超时；发现 Ctrl+C 没人理 |
| 2 | [38166880603](https://github.com/paddychenc75/runyard/actions/runs/38166880603) | 全量 50 次；17 个任务成功；Windows nuxt3 出事故；`macos-26` 的 Python 启动慢 |
| 3 | [38169408526](https://github.com/paddychenc75/runyard/actions/runs/38169408526) | 补跑 3 个任务；2 个成功，Windows nuxt3（taskkill）挂死 |
| 4 | [38171628570](https://github.com/paddychenc75/runyard/actions/runs/38171628570) | 修掉认后代的问题后补跑 3 个任务，全部成功；记到辅助程序的竞态 |
| 5 | [38172582221](https://github.com/paddychenc75/runyard/actions/runs/38172582221) | 全量 50 次，最终数据，20 个任务全部成功 |

实验装过的依赖：运行器的测试项目在运行时生成，不进仓库。因 14 天发布年龄规则，装的是较旧版本：vite 8.3.1（设计选 8.3.3）、next 16.3.6（设计选 16.3.8；该版本有 6 条公告含 1 条高危 GHSA-cjq9-62q9-8jv4，只在临时目录里绑定 `127.0.0.1` 跑几秒）、hono 4.13.9、@hono/node-server 2.1.1。
