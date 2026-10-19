# runners Specification

## Purpose

约定六个运行器（第一版；Next 和 Nuxt 运行器随各自模板暂缓）各自必须保证什么，写成可以测的行为：启动到就绪（脚本是跑到退出）、停止后端口释放和没有残留进程、语法错误时的行为、只监听 `127.0.0.1`。六个运行器是：静态页面（给 `html`）、Vite（给 `react19`、`react18`、`vue3`）、`node-ts`（给 `node-ts`）、Python（给 `python`）、Go（给 `go`）、Hono（给 `hono`）。运行器格式的规则、`template lint` 的判定、模板固定的版本在 templates/format；状态、停止、失败的通用规则在 run/lifecycle，脚本的共性在 run/scripts，端口在 run/ports。这里不写八个模板各自的内容。

## Requirements

### Requirement: 所有运行器共同保证
服务类运行器（静态页面、Vite、Hono）MUST 从启动走到 `ready`，其预览地址 MUST 是 `http://127.0.0.1:<端口>/`；脚本类运行器（`node-ts`、Python、Go）MUST 跑到退出。所有服务 MUST 只监听 `127.0.0.1`，MUST NOT 监听所有网卡。停止后 MUST 确认没有带本次运行标记的进程存活，端口 MUST 在 3 秒内可以重新绑定。强制结束后的下一次启动、启动中途停止后的下一次启动、安装中途停止后的重装和下一次启动，MUST 都不因残留的锁文件或半成品缓存而失败。运行器 MUST NOT 让工具联网下载运行环境或开启遥测。
来源：PRD #prd-first-templates；PRD #prd-stop；PRD #prd-template-engineering；ADR 0006

#### Scenario: [TEMPLATES-RUNNERS-01] 每个服务类运行器都能到达就绪
- 前提：真实环境，依赖已安装
- **WHEN** 分别启动 `html`、`react19`、`react18`、`vue3`、`hono`
- **THEN** 每个都到达 `ready`，`url` 以 `http://127.0.0.1:` 开头，对该地址的 `GET /` 得到 HTTP 响应
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-02] 只监听本机
- 前提：以上每个服务都在 `ready`
- **WHEN** 列出它们的监听地址
- **THEN** 只有 `127.0.0.1`（可以附带 `::1`），没有 `0.0.0.0` 或其他网卡地址
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-03] 停止后端口释放且没有残留
- 前提：每个服务类运行器各自 `ready`
- **WHEN** 对它执行停止
- **THEN** `stop` 返回时整棵进程树为空，没有带运行标记的进程；停止后 3 秒内端口可以重新绑定
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-04] 强制结束后可以再次启动
- 前提：服务 `ready`，进程树被强制结束（模拟崩溃）
- **WHEN** 立即再次启动同一个项目、同一个端口
- **THEN** 启动成功并到达 `ready`，没有被残留的锁文件或缓存挡住
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-05] 启动中途停止
- 前提：服务处于 `starting`
- **WHEN** 在启动到约一半时停止，随后马上再启动一次
- **THEN** 第二次启动成功到达 `ready`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-06] 安装中途停止
- 前提：依赖正在安装（`installing`）
- **WHEN** 中途停止，再原样启动
- **THEN** 重新安装并到达 `ready`，没有因半成品的依赖目录而失败
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-07] 不联网下载、不开遥测
- **WHEN** 启动 Python、Go 的运行并检查子进程环境
- **THEN** uv 和 Go 的自动下载被关闭；没有设置 `CI`
- 验证：test

### Requirement: 静态页面运行器由管理进程自己托管
静态页面运行器（`html`）MUST NOT 起子进程：页面由管理进程自己托管，仍然有状态、有端口、计入“N 个运行中”。文件改动 MUST 在下一次请求时就能看到，MUST NOT 缓存旧内容。托管 MUST NOT 提供项目文件夹之外的文件。停止后端口 MUST 在 3 秒内可重新绑定。
来源：PRD #prd-first-templates；PRD #prd-run；ADR 0006

#### Scenario: [TEMPLATES-RUNNERS-08] 没有子进程
- **WHEN** 启动 `html` 项目
- **THEN** 状态到达 `ready`、有端口，管理进程没有为它起任何子进程；它计入“运行中”的数量
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-09] 改动立即可见
- 前提：`html` 项目 `ready`，页面标题是 `A`
- **WHEN** 把 `index.html` 里的标题改成 `B`，再请求一次
- **THEN** 响应里是 `B`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-10] 不泄露项目之外的文件
- **WHEN** 请求 `/../secret.txt` 和 `/%2e%2e/secret.txt`，其中 `secret.txt` 在项目文件夹的上一层
- **THEN** 都得不到该文件的内容（得到 404 或 403）
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-11] 停止后立即可以重新绑定
- **WHEN** 停止 `html` 项目
- **THEN** `stop` 返回时端口已可重新绑定，所有已建立的连接已断开
- 验证：test

### Requirement: Vite 运行器直接用 Node 运行 Vite，不经包管理器
Vite 运行器（`react19`、`react18`、`vue3`）MUST 以 `node` 直接运行 Vite 的入口文件，MUST NOT 经过 `pnpm exec` 或 `npx`；MUST 传 `--port {port} --strictPort --host 127.0.0.1 --clearScreen false`，MUST NOT 传 `--no-color`。就绪 MUST 以收到 `GET /` 的 HTTP 响应为准。热更新由 Vite 自己完成，保存文件 MUST NOT 重启进程。安装 MUST 优先用 pnpm（`--prefer-offline`），没有 pnpm 时 MUST 改用 npm 并说明一行（`PACKAGE_MANAGER_FALLBACK`）。安装失败且输出匹配“离线未缓存”的特征时 MUST 报 `DEPS_OFFLINE`；pnpm 因没有终端无法确认清空 `node_modules` 而以 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 失败时 MUST 带 `--config.confirmModulesPurge=false` 重试一次，且 MUST NOT 为此设置 `CI=1`；`ERR_PNPM_IGNORED_BUILDS` 与 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` MUST 被识别并报 `SETUP_FAILED`，`cause` 带输出末尾。停止方式 MUST 是 `graceful`，`graceMs` 2000。
来源：PRD #prd-first-templates；PRD #prd-template-engineering；PRD #prd-failure-states；ADR 0011

#### Scenario: [TEMPLATES-RUNNERS-12] 命令不经包管理器
- **WHEN** 启动 `react19` 项目并检查实际执行的命令
- **THEN** 第一个词是检测到的 `node` 的绝对路径，参数里有 Vite 的入口文件、`--host`、`127.0.0.1`、`--strictPort`、`--clearScreen`、`false`，没有 `pnpm`、`npx`、`--no-color`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-13] 保存文件不重启进程
- 前提：`react19` 项目 `ready`
- **WHEN** 修改 `src/App.tsx`
- **THEN** 进程号不变，状态仍是 `ready`，没有进入 `reloading`；页面内容在下一次加载时已更新
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-14] 没有 pnpm 时改用 npm
- 前提：本机没有 pnpm，有 npm
- **WHEN** 启动尚未安装依赖的 `react19` 项目
- **THEN** 用 npm 安装，日志里有 `PACKAGE_MANAGER_FALLBACK` 提示，最终到达 `ready`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-15] 离线且依赖未缓存
- 前提：网络不可用，包存储里没有依赖，安装输出里有 `ENOTFOUND`
- **WHEN** 启动项目
- **THEN** `failed`，错误码 `DEPS_OFFLINE`，命令行退出码 5，项目仍可编辑
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-16] 没有终端时 pnpm 要确认清空依赖目录
- 前提：`node_modules` 来自另一个包管理器，pnpm 在没有终端时报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`
- **WHEN** 启动项目
- **THEN** 系统带 `--config.confirmModulesPurge=false` 重试一次并成功；子进程环境里没有 `CI`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-17] 其他两个 pnpm 错误
- 前提：安装输出里有 `ERR_PNPM_IGNORED_BUILDS`，另一次有 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`
- **WHEN** 各启动一次
- **THEN** 都是 `failed`，错误码 `SETUP_FAILED`，`cause.outputTail` 里带 pnpm 的原文
- 验证：test

### Requirement: Next 和 Nuxt 运行器看 HTTP 响应判断就绪，并只监听本机
Next 和 Nuxt 运行器随各自模板暂缓，第一版没有。Next 恢复后 MUST 关闭遥测，MUST 传 `-H 127.0.0.1` 和 `-p {port}`。Nuxt 加回来时 MUST 传 `--host 127.0.0.1` 和端口。两者恢复后，就绪 MUST 以收到 HTTP 响应为准，MUST NOT 以端口能连上为准（端口先开、页面后编译好）。Next 在退出时另起的、脱离进程组的遥测进程 MUST 在停止后、改名或移到废纸篓之前被等走（上限 2 秒，还在就结束）。Nuxt 回来之后，它的四个进程 MUST 在停止时整棵结束。
来源：PRD #prd-first-templates；PRD #prd-status-and-ports；ADR 0006

#### Scenario: [TEMPLATES-RUNNERS-18] 端口开了但页面没好
- 前提：Next 已恢复内置（第一版暂缓）；端口已开，首页还在编译，请求会挂起
- **WHEN** 等待就绪
- **THEN** 状态仍是 `starting`；收到 HTTP 响应后才变为 `ready`
- 验证：manual（第一版不含 Next，按负责人决定暂缓；恢复内置时改回 test 并补测试）

#### Scenario: [TEMPLATES-RUNNERS-19] 监听地址参数
- 前提：Next 已恢复内置（第一版暂缓）
- **WHEN** 启动 `next16` 并检查实际命令
- **THEN** 命令含 `-H` 和 `127.0.0.1`；监听地址只有 `127.0.0.1`
- 验证：manual（第一版不含 Next，按负责人决定暂缓；恢复内置时改回 test 并补测试）

#### Scenario: [TEMPLATES-RUNNERS-20] Next 退出时的遥测进程
- 前提：Next 已恢复内置（第一版暂缓）；`next16` 项目 `ready`；它退出时另起一个脱离进程组、带运行标记的进程，最长活 1 秒
- **WHEN** 停止后立即重命名该项目
- **THEN** 重命名之前先等带标记的进程走掉（上限 2 秒）；重命名成功，没有 `PATH_LOCKED`
- 验证：manual（第一版不含 Next，按负责人决定暂缓；恢复内置时改回 test 并补测试）

#### Scenario: [TEMPLATES-RUNNERS-21] Nuxt 整棵进程树被结束
- 前提：Nuxt 已加回内置目录（第一版没有 Nuxt 运行器，本场景暂缓）；`nuxt4` 项目 `ready`，进程树有四个进程
- **WHEN** 停止
- **THEN** 四个进程全部结束，端口 3 秒内可重新绑定；`nuxt3` 同样
- 验证：manual（第一版不含 Nuxt 运行器，暂缓；Nuxt 加回内置目录时改回 test 并补测试）

#### Scenario: [TEMPLATES-RUNNERS-22] 全栈框架的启动时间目标
- 前提：Next 已恢复内置；依赖已缓存，在一台 Apple 芯片的 Mac 上
- **WHEN** 启动 `next16`
- **THEN** 从启动到页面可访问不超过 5 秒
- 验证：manual（第一版不含 Next，暂缓；恢复后在发布前实机测量并记录，依赖机器和缓存状态）

### Requirement: `node-ts` 运行器直接运行 TypeScript，不加依赖
`node-ts` 运行器 MUST 用 `node` 直接运行入口 `.ts` 文件，MUST NOT 依赖额外的加载器或第三方包；它声明 `kind` 为 `oneshot`、`run.stdin` 为 `true`、`watch.mode` 为 `rerun`；语法检查 MUST 用 Node 的 `stripTypeScriptTypes`，MUST NOT 用 `node --check`。用户机器上的 Node 低于模板声明的下限时，MUST 在运行前报 `TOOL_TOO_OLD`。
来源：PRD #prd-first-templates；PRD #prd-script-projects；PRD #prd-runtime-requirements；ADR 0011

#### Scenario: [TEMPLATES-RUNNERS-23] 运行带类型注解的脚本
- 前提：入口文件 `main.ts` 带类型注解，打印 `ok`
- **WHEN** 运行
- **THEN** `finished`，退出码 0，输出含 `ok`；模板里没有 `node_modules`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-24] Node 太旧
- 前提：本机 Node 是 22.17.0
- **WHEN** 运行 `node-ts` 项目
- **THEN** `failed`，错误码 `TOOL_TOO_OLD`，参数含工具名、要求的范围和 `22.17.0`；退出码 4；脚本没有被执行
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-25] 语法错误时的行为
- 前提：`main.ts` 有语法错误
- **WHEN** 保存后触发重新运行
- **THEN** 脚本没有运行，项目 `stale`（规则见 run/scripts）；合法的带类型注解的文件通过检查
- 验证：test

### Requirement: Python 运行器不缓冲、不写字节码、检查语法不落盘
Python 运行器 MUST 用检测到的解释器以 `-u` 运行入口文件，环境变量 `PYTHONDONTWRITEBYTECODE` 为 `1`；MUST 声明 `run.stdin` 为 `true`、`watch.mode` 为 `rerun`。语法检查 MUST 用 `ast.parse`，MUST NOT 写 `__pycache__`，语法错误时 MUST 以非 0 退出。P0 的 Python 模板没有第三方依赖，运行器 MUST NOT 调用 uv。用户机器上的 Python 低于下限时 MUST 报 `TOOL_TOO_OLD`。
来源：PRD #prd-first-templates；PRD #prd-script-projects；PRD #prd-runtime-requirements

#### Scenario: [TEMPLATES-RUNNERS-26] 打印中文
- **WHEN** 运行一个打印中文的 Python 脚本
- **THEN** 脚本以 0 结束，日志里的中文可读
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-27] 检查语法不写字节码
- 前提：项目文件夹里没有 `__pycache__`
- **WHEN** 对合法和不合法的脚本各执行一次检查，并各运行一次
- **THEN** 合法的通过、不合法的以非 0 退出；检查和运行之后项目文件夹里都没有 `__pycache__`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-28] 读取标准输入
- 前提：脚本调用 `input()`
- **WHEN** 经 `run.stdin` 写入一行
- **THEN** 脚本读到并结束（输入的行为见 run/scripts）
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-29] 不调用 uv
- **WHEN** 运行 Python 项目并记录所有被执行的命令
- **THEN** 其中没有 `uv`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-30] Python 太旧
- 前提：本机 Python 是 3.11.9
- **WHEN** 运行 `python` 项目
- **THEN** `failed`，`TOOL_TOO_OLD`，退出码 4
- 验证：test

### Requirement: Go 运行器用中断方式停止，不留编译目录，不联网下载工具链
Go 运行器 MUST 用 `go run` 运行入口文件；`stop.mode` MUST 是 `interrupt`；管理进程 MUST 为每次运行设置单独的 `GOTMPDIR` 并在停止后删除它（停止的具体保证见 RUN-LIFECYCLE-19）。语法检查 MUST 用 `gofmt -e -l`，语法错误时它以退出码 2 结束，MUST 视为检查不通过；写法不规范但语法正确的文件 MUST 视为通过。运行时 MUST 关闭 Go 的工具链自动下载：`go.mod` 要求的版本高于本机时，MUST NOT 联网下载，脚本照 Go 自己的报错以非 0 退出，进入 `errored`。检测 Go 的版本 MUST 用 `go version`。
来源：PRD #prd-first-templates；PRD #prd-runtime-requirements；ADR 0006；ADR 0011

#### Scenario: [TEMPLATES-RUNNERS-31] 运行并停止不留编译目录
- 前提：一个会一直运行的 Go 程序
- **WHEN** 运行后停止
- **THEN** 这次运行的 `GOTMPDIR` 已被删除，系统临时目录里没有残留的 `go-build*`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-32] 语法错误
- 前提：`main.go` 有语法错误
- **WHEN** 保存后触发重新运行
- **THEN** `gofmt -e -l` 以 2 退出，脚本没有运行，项目 `stale`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-33] 格式不规范但语法正确
- 前提：`main.go` 缩进混乱但可以编译
- **WHEN** 保存后触发重新运行
- **THEN** 检查通过，脚本正常运行
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-34] go.mod 要求更新的 Go
- 前提：`go.mod` 要求高于本机的 Go 版本，网络可用
- **WHEN** 运行
- **THEN** 没有下载任何工具链；脚本以非 0 退出，状态 `errored`，输出里有 Go 自己的报错
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-35] Go 太旧
- 前提：本机 Go 是 1.25.0
- **WHEN** 运行 `go` 项目
- **THEN** `failed`，`TOOL_TOO_OLD`，退出码 4，参数里有当前版本 `1.25.0`
- 验证：test

### Requirement: Hono 运行器由管理进程重启服务，端口不变
Hono 运行器（`hono`）的 `kind` MUST 是 `server`，`watch.mode` MUST 是 `restart`，`preview.type` MUST 是 `request`。保存文件后 MUST 由管理进程先停止再启动：期间状态是 `reloading`，日志里有 `RELOADING` 提示，端口 MUST 不变，随后回到 `ready`。服务 MUST 只绑定 `127.0.0.1`，监听地址写在模板自己的代码里。就绪 MUST 以收到 HTTP 响应为准。
来源：PRD #prd-run；PRD #prd-first-templates；PRD #prd-ports

#### Scenario: [TEMPLATES-RUNNERS-36] 保存后重启
- 前提：`hono` 项目在端口 7104 `ready`
- **WHEN** 保存入口文件
- **THEN** 状态依次是 `reloading`、`ready`；新进程在同一个端口 7104；旧进程树已被整棵结束；日志里有一条 `RELOADING` 提示
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-37] 重启后内容更新
- 前提：服务对 `GET /` 返回 `v1`
- **WHEN** 把代码改成返回 `v2` 并保存，等待回到 `ready`
- **THEN** `GET /` 返回 `v2`
- 验证：test

#### Scenario: [TEMPLATES-RUNNERS-38] 连续保存只重启一次
- **WHEN** 在合并窗口内连续保存三次
- **THEN** 只发生一次重启
- 验证：test
