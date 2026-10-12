# 运行：状态机、持有者、停止与释放

一个项目的一次“运行”从开始到结束的全部规则。`runner.json` 各字段怎么变成行为见 [runner-format.md](runner-format.md)；消息见 [protocol-methods.md](protocol-methods.md)。实现位置：状态机和进程生命周期在 `core` 的运行引擎（`packages/core/src/run/`，接缝与用法见 `packages/core/AGENTS.md`），持有者和空闲停止在 `supervisor`。

出处：技术设计 §2.4、§4.1、§4.3、§4.5、§4.6、§4.8；决策记录 [0006](decisions/0006-stop-process-tree.md)（[证据](evidence/0006-stop-process-tree.md)）、[0005](decisions/0005-supervisor-singleton-handshake.md)、[0008](decisions/0008-log-capture-and-cleaning.md)；PRD #prd-run、#prd-run-ownership、#prd-idle-stop、#prd-status-and-ports、#prd-stop、#prd-failure-states、#prd-script-projects。

## 1. 状态与转移

状态名（代码标识符）：`checking` `installing` `starting` `ready` `reloading` `running` `stopping` `stopped` `finished` `errored` `crashed` `failed`。

| 类型 | 路径 | 说明 |
| --- | --- | --- |
| 服务、页面（`server`、`static`） | `checking` → `installing` → `starting` → `ready` ⇄ `reloading` | `static` 没有子进程：管理进程自己托管，照常有端口、有状态、计入“运行中” |
| 脚本（`oneshot`） | `checking` → [`installing`] → `running` → `finished`（退出码 0）或 `errored`（非 0） | 没有 `ready`、没有端口 |
| 失败 | `checking` 缺工具或版本过低 → `failed`（`TOOL_MISSING` / `TOOL_TOO_OLD`）；`installing` 失败 → `failed`（`SETUP_FAILED` / `DEPS_OFFLINE`）；`starting` 时进程退出 → `failed`（`RUN_FAILED`） | 界面“缺少环境”就是 `failed` 加这两个原因 |
| 崩溃 | `ready` 或 `reloading` 时进程退出 → `crashed` | 不自动重启（唯一例外：由应用负责重启的服务，崩溃后下一次保存文件时再启动一次） |
| 停止 | 任何活动状态 → `stopping` → `stopped` | |
| 脚本重跑 | 文件变化时先过 `check`：通过才重跑；不通过不运行，保留上次输出并标 `stale` | |

活动状态（计入“N 个运行中”）：`checking` `installing` `starting` `ready` `reloading` `running` `stopping`。跑完的脚本（`finished` `errored`）、`failed` `crashed` `stopped` 不计入。持有者两类都算。

## 2. 规则

| 规则 | 内容 |
| --- | --- |
| 一次一个 | 一个项目同时只有一次运行；再启动返回现有运行并带 `alreadyRunning: true`（PRD #prd-cli-json） |
| 超时不算失败 | `starting` 超过 `slowAfterMs`（30 秒）只是界面加“较慢”；进程退出才算失败。命令行 `--timeout`（默认 60 秒）到点返回 `READY_TIMEOUT`，进程照常留着 |
| 改名 | `installing`、`starting` 中拒绝（`BUSY`）；其余先停止，见第 5 节 |
| 创建不是运行状态 | “复制”一步对应 `playground.create` 返回；之后才有运行 |
| 回退提示 | 没有 pnpm 改用 npm：输出一行说明，工作区一条提示（不算失败） |

## 3. 持有者与应用生命周期（§2.4，PRD #prd-run-ownership）

持有者是运行上的字段：`tab`（绑定到应用的那条连接）或 `cli`（不绑定任何连接）。

| 事件 | `tab` 持有的运行 | `cli` 持有的运行 |
| --- | --- | --- |
| 关闭标签页 | 立刻停止（界面先弹确认） | 不受影响，标签页只是“查看” |
| 正常退出应用 | main 发 `session.bye`，管理进程停掉这条连接名下全部，最多等 5 秒 | 继续 |
| 应用崩溃或被强杀 | 连接断开，管理进程等 5 秒（留给重连）后全部停止 | 继续 |
| 管理进程自己崩溃 | 子进程不会自己退出（K2 实测）。下次启动时按 `run/runs` 记录逐个核对 pid 加启动时间，仍活着的整棵结束，标 `crashed`；不做“重新接管” | 同左 |
| `run.adopt` | 持有者改为 `tab` | 持有者从 `cli` 改 `tab` |

实测（0005）：正常退出后最大 166 毫秒停止；强杀后 5.01 到 5.09 秒停止。

## 4. 停止（决策记录 0006，算法见证据文件，此处不重复）

保证（实现和测试要满足）：

- 停的是**整棵进程树**，不只是主进程；返回时树里没有活着的进程，且端口已可重新绑定（PRD #prd-stop）。
- 只等进程的 `exit` 事件，不等输出管道的 `close`；确认停止后主动销毁管道。
- macOS：每次运行自成进程组，整组发信号，等 `graceMs`（默认 2000，不是 3000），再整组强制结束。Windows（以后，依据 0006 的实测）：先核对根进程 pid **和**创建时间，再 `taskkill /PID <pid> /T /F`，等 `exit`，再试绑端口复查。接口层面只有“带宽限的终止”和“进程身份 = pid + 启动时间”，不出现信号和进程组。
- `stop` 在 `runner.json` 里不写信号名；Go 的运行器用 `interrupt`，管理进程为每次运行设单独的 `GOTMPDIR` 并在停止后删除。
- 停止后 3 秒内端口可重新绑定（实测 3.0 到 3.3 秒，所以 `graceMs` 取 2000）。

## 5. 改名和移到废纸篓的固定顺序（§4.3）

由管理进程执行，命令行的 `rm` 和改名走同一条路径：

1. 停止运行。
2. 向所有已连接的客户端发 `playground.releaseRequested { playgroundId, reason: 'rename' | 'trash' }`；桌面应用收到后结束该项目的终端、关掉文件进程对它的监听和目录树，再调 `playground.released`。
3. 等全部回报，最多 3 秒；超时的客户端记一行日志，继续。
4. 管理进程关掉自己对该项目的文件监听；在全机找带本次运行标记的进程，等它们走掉（上限 2 秒，还在就结束）。
5. 改名或移到废纸篓。仍被占用返回 `PATH_LOCKED`（`EBUSY` `EPERM` `EACCES` 都归它）。一律走平台层 `fs.trash`（0010）；Windows 上依赖目录先直接删除的规则推迟，做 Windows 时再用。
6. 改名前在运行的项目，改名后自动 `run.start`，持有者不变。

## 6. 空闲停止（§4.6，PRD #prd-idle-stop）

只针对 `cli` 持有的运行，默认 30 分钟（设置 `cliIdleStopMinutes`）。任一项把计时归零：进程有输出；项目里的文件有变化；有命令提到它（`run` `logs` `status <名称>` 请求面板）；端口上有已建立的连接（每 60 秒采样一次）。**应用里有标签页在查看它不算活动。** 到点后按正常流程停止，日志加一行系统提示，`run.exit` 带 `reason: 'idle'`。脚本不参与。

## 7. 端口与环境（§4.5）

| 主题 | 约定 |
| --- | --- |
| 分配 | 创建时取范围（默认 7100 到 7999）内没登记过的最小端口，写进 `library.json`，以后沿用 |
| 被占用 | 往后找下一个空闲端口，**只用于这一次**，下次仍先试原端口；发 `run.port` 事件；不是错误，结果带 `portFallback` |
| 判断空闲 | 只在 `127.0.0.1` 和 `::1` 上试绑，不试 `0.0.0.0`；（Windows 以后：绑定报“无权限”当作被系统保留，`PORT_RESERVED`，查不到占用者） |
| 严格 | 给工具传 `--strictPort` 一类参数；URL 一律写字面量 `127.0.0.1` |
| 就绪探测 | 管理进程直连 `127.0.0.1:<端口>`，不读任何代理设置；Next、Nuxt 必须探测 HTTP 响应 |
| 子进程环境 | 用户登录环境为底；去掉 Electron 自己的变量（漏删 `ELECTRON_RUN_AS_NODE` 必须有测试守着）；加 `PORT`、强制颜色、`NEXT_TELEMETRY_DISABLED=1` 等关闭遥测和自动下载的变量；所有系统都加 `PYTHONUTF8=1` 和 `PYTHONUNBUFFERED=1`；设置里的镜像源和代理；不设 `CI=1` |

## 未定

1. 环境变量的完整清单：设计点名了上表几项；最初方案另列 `HOST`、`RUNYARD*`、`BROWSER=none`、`NO_UPDATE_NOTIFIER`、`GOTOOLCHAIN=local`、`UV_PYTHON_DOWNLOADS=never` 等，设计未逐项确认。
2. 5 秒、3 秒、10 秒三个数字各自覆盖的步骤，证据 0005 只给了合计关系（5+3 在 10 以内）。
3. `alreadyRunning` 时是否算作“有命令提到它”（按第 6 节应算，需规格写明）。
4. 脚本重跑时旧进程的处理细节（`watch.mode = rerun`：先停旧的再起，`debounce` 数值）。
5. “应用负责重启的服务”（崩溃后下一次保存再起一次）在 M1 是否实现，还是留给桌面应用。
