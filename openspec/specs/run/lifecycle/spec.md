# lifecycle Specification

## Purpose

约定一个项目的一次运行经历哪些状态、什么时候算失败、怎样启动和停止，以及停止必须保证什么。运行失败不会让创建失败，项目始终保持可编辑。谁持有一次运行、什么时候自动停止，在 run/ownership；端口在 run/ports；输出日志在 run/logs。

## Requirements

### Requirement: 任何时刻只有一个明确的状态
一次运行在任何时刻 MUST 处于且仅处于这十二个状态之一：`checking` `installing` `starting` `ready` `reloading` `running` `stopping` `stopped` `finished` `errored` `crashed` `failed`。服务和页面 MUST 经 `checking`、`installing`、`starting` 到 `ready`；脚本 MUST 经 `running` 到 `finished`（退出码 0）或 `errored`（非 0）。
来源：PRD #prd-status-and-ports；PRD #prd-script-projects

#### Scenario: [RUN-LIFECYCLE-01] 服务正常启动
- 前提：项目的工具齐全，依赖已安装
- **WHEN** 启动一个服务类项目
- **THEN** 状态依次经过 `checking`、`starting`，到 `ready` 为止；每次状态变化都产生 `run.state` 事件
- 验证：test

#### Scenario: [RUN-LIFECYCLE-02] 脚本正常结束
- **WHEN** 启动一个脚本，它以退出码 0 结束
- **THEN** 状态是 `finished`，结果带退出码 0 和耗时；它不再计入“运行中”
- 验证：test

#### Scenario: [RUN-LIFECYCLE-03] 脚本以非零退出码结束
- **WHEN** 启动一个脚本，它以退出码 1 结束
- **THEN** 状态是 `errored`，结果带退出码 1；命令行退出码为 6，错误码 `SCRIPT_ERRORED`
- 验证：test

### Requirement: 失败不连累创建，且原因明确
运行失败 MUST NOT 使项目创建失败。缺工具、版本过低、安装失败、就绪前退出 MUST 进入 `failed` 并带明确的错误码；就绪之后进程退出 MUST 进入 `crashed`，且 MUST NOT 自动重启。
来源：PRD #prd-failure-states

#### Scenario: [RUN-LIFECYCLE-04] 缺少工具
- 前提：项目需要 Go，本机没有
- **WHEN** 启动该项目
- **THEN** 状态 `failed`，错误码 `TOOL_MISSING`，参数含工具名和要求的版本范围；项目文件夹和已创建的文件原样保留；命令行退出码 4
- 验证：test

#### Scenario: [RUN-LIFECYCLE-05] 工具版本过低
- 前提：项目要求某工具的下限高于本机已装版本
- **WHEN** 启动该项目
- **THEN** 状态 `failed`，错误码 `TOOL_TOO_OLD`，参数含要求的范围和当前版本；退出码 4
- 验证：test

#### Scenario: [RUN-LIFECYCLE-06] 依赖安装失败
- **WHEN** 安装依赖的命令失败，输出不匹配任何“离线未缓存”的特征
- **THEN** 状态 `failed`，错误码 `SETUP_FAILED`，`cause` 带输出末尾；命令行退出码 5
- 验证：test

#### Scenario: [RUN-LIFECYCLE-07] 离线且依赖未缓存
- **WHEN** 安装依赖失败，输出匹配运行器登记的“离线未缓存”特征
- **THEN** 状态 `failed`，错误码 `DEPS_OFFLINE`；退出码 5；项目仍可编辑
- 验证：test

#### Scenario: [RUN-LIFECYCLE-08] 启动阶段进程退出
- **WHEN** 服务进程在就绪之前退出
- **THEN** 状态 `failed`，错误码 `RUN_FAILED`，`cause` 带退出码和输出末尾；命令行退出码 6
- 验证：test

#### Scenario: [RUN-LIFECYCLE-09] 运行中崩溃
- 前提：服务处于 `ready`
- **WHEN** 服务进程自己退出
- **THEN** 状态 `crashed`；管理进程不自动重启它
- 验证：test

#### Scenario: [RUN-LIFECYCLE-10] 启动超时不算失败
- 前提：服务启动已超过 30 秒仍未就绪，进程仍在
- **WHEN** 查询状态
- **THEN** 状态仍是 `starting`（界面可以另加“较慢”字样）；只有进程退出才变为 `failed`
- 验证：test

#### Scenario: [RUN-LIFECYCLE-11] 命令行等待就绪超时
- 前提：命令行执行 `run`，等待时间用 `--timeout`
- **WHEN** 时间到了服务还没就绪
- **THEN** 命令行返回错误码 `READY_TIMEOUT`、退出码 7；服务进程继续运行，没有被杀
- 验证：test

### Requirement: 一个项目同时只有一次运行
对正处于活动状态的项目再次启动，MUST 返回现有的那次运行并带 `alreadyRunning: true`，MUST NOT 再起一个进程。
来源：PRD #prd-cli-json

#### Scenario: [RUN-LIFECYCLE-12] 重复启动
- 前提：项目已是 `ready`
- **WHEN** 再次对它执行 `run`
- **THEN** 返回同一个 `runId`，`alreadyRunning` 为 `true`，进程数不变
- 验证：test

#### Scenario: [RUN-LIFECYCLE-13] 并发启动
- **WHEN** 两个客户端同时对同一个项目请求启动
- **THEN** 只起一个进程树，两个客户端拿到同一个运行
- 验证：test

### Requirement: 停止整棵进程树并确认端口已释放
停止 MUST 作用于整棵进程树，不只是主进程；`stop` 返回之前 MUST 确认进程树已空；停止之后 3 秒内 MUST 能重新绑定该端口。停止 MUST 只等进程的退出事件，MUST NOT 等输出管道关闭。
来源：PRD #prd-stop；ADR 0006

#### Scenario: [RUN-LIFECYCLE-14] 停止有孙进程的服务
- 前提：服务进程再起了子进程和孙进程
- **WHEN** 对它执行停止
- **THEN** 整棵树里没有活着的进程；`stop` 返回时端口可以重新绑定（停止后 3 秒内）
- 验证：test

#### Scenario: [RUN-LIFECYCLE-15] 优雅等待后强制结束
- 前提：运行器声明 `graceMs` 为 2000，进程忽略终止请求
- **WHEN** 执行停止
- **THEN** 先请求终止，等满 2000 毫秒后强制结束整棵树；`stop` 返回时进程树为空
- 验证：test

#### Scenario: [RUN-LIFECYCLE-16] 后代拿着输出管道不放
- 前提：被停止的进程树里有一个后代仍持有输出管道的写端
- **WHEN** 根进程已经退出
- **THEN** `stop` 仍然在整棵树确认为空后返回，不因输出管道没有关闭而卡住
- 验证：test

#### Scenario: [RUN-LIFECYCLE-17] Windows 上进程号被复用
- 前提：Windows 上，记录的根进程号现在属于另一个无关进程，创建时间与本次运行启动时记下的不同
- **WHEN** 执行停止
- **THEN** 创建时间不符的进程没有被结束；该运行按已退出处理
- 验证：test

#### Scenario: [RUN-LIFECYCLE-18] Windows 上结束整棵树再复查端口
- 前提：Windows 上一个服务进程树有多层进程
- **WHEN** 执行停止
- **THEN** 先核对根进程的进程号和创建时间，再结束整棵树，等退出事件，再试绑端口；端口绑不上时，只结束创建时间晚于本次运行启动的监听者
- 验证：test

#### Scenario: [RUN-LIFECYCLE-19] Go 脚本停止后不留临时目录
- 前提：运行器是 Go 的，停止方式为 `interrupt`，管理进程为这次运行设置了单独的临时目录
- **WHEN** 停止该运行
- **THEN** 这次运行的临时目录在停止后被删除，没有残留的 `go-build` 目录
- 验证：test

#### Scenario: [RUN-LIFECYCLE-20] 改名之前等脱离进程组的后代
- 前提：Next 在退出时另起了一个脱离进程组、带本次运行标记的遥测进程，最长活 0.95 秒
- **WHEN** 停止后要改名或移到废纸篓
- **THEN** 先等带标记的进程走掉（上限 2 秒，还在就结束），再继续
- 验证：test

#### Scenario: [RUN-LIFECYCLE-21] 没有信号名
- **WHEN** 检查运行器格式
- **THEN** `stop` 里只有 `graceful` 或 `interrupt` 和 `graceMs`，不出现任何信号名；`graceMs` 缺省为 2000
- 验证：test

### Requirement: 重启和全部停止
`restart` MUST 先停止再启动，端口 MUST 不变。`stopAll` MUST 停止所有运行；带 `mine` 时 MUST 只停止命令行持有的。
来源：PRD #prd-stop；PRD #prd-run-ownership

#### Scenario: [RUN-LIFECYCLE-22] 重启保持端口
- 前提：服务在端口 7100 上 `ready`
- **WHEN** 执行重启
- **THEN** 旧进程树被整棵结束，新进程在同一个端口上 `ready`
- 验证：test

#### Scenario: [RUN-LIFECYCLE-23] 只停命令行持有的
- 前提：有一个标签页持有的运行和一个命令行持有的运行
- **WHEN** 执行 `stop --all --mine`
- **THEN** 只有命令行持有的运行被停止
- 验证：test

### Requirement: “N 个运行中”由管理进程计算
管理进程 MUST 计算“运行中”的数量并随状态事件带出，包含 `checking` `installing` `starting` `ready` `reloading` `running` `stopping` 七种状态，不分持有者；`finished`、`errored`、`failed`、`crashed`、`stopped` MUST NOT 计入。
来源：PRD #prd-run-ownership；PRD #prd-script-projects

#### Scenario: [RUN-LIFECYCLE-24] 脚本跑完不计数
- 前提：一个服务在 `ready`，一个脚本正在 `running`
- **WHEN** 脚本以退出码 0 结束
- **THEN** 数量由 2 变为 1
- 验证：test

### Requirement: 子进程环境不泄露管理进程自己的变量，命令不经过 shell
启动子进程时 MUST 去掉管理进程继承的 `ELECTRON_RUN_AS_NODE`；运行器命令 MUST 作为参数数组启动，MUST NOT 经过 shell。
来源：ADR 0005；PRD #prd-run

#### Scenario: [RUN-LIFECYCLE-25] 管理进程由 Electron 拉起时
- 前提：管理进程的环境里有 `ELECTRON_RUN_AS_NODE=1`
- **WHEN** 它启动一个用户项目的进程
- **THEN** 子进程的环境里没有 `ELECTRON_RUN_AS_NODE`
- 验证：test

#### Scenario: [RUN-LIFECYCLE-26] 参数里的特殊字符原样传递
- 前提：资源库所在的路径里含空格
- **WHEN** 运行器的命令被替换占位符后启动
- **THEN** 每个占位符对应一个完整的参数，空格不会拆开参数，也不会被 shell 解释
- 验证：test
