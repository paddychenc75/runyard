# ownership Specification

## Purpose

每一次运行有一个持有者：在桌面应用里打开标签页启动的由标签页持有，通过命令行（包括智能体）启动的由命令行持有。本规格约定两种持有者在关闭标签页、退出应用、应用崩溃时各自会发生什么，以及命令行持有的运行怎样在空闲后自动停止，避免智能体启动的服务一直挂着。

## Requirements

### Requirement: 标签页持有的运行随标签页结束
标签页持有的运行 MUST 在标签页关闭后 3 秒内停止整棵进程树并释放端口。标签页开着时手动停止 MUST 使运行进入 `stopped`。
来源：PRD #prd-run-ownership；PRD #prd-close-tab-confirm

#### Scenario: [RUN-OWNERSHIP-01] 关掉正在运行的标签页
- 前提：一个标签页持有的运行处于 `ready`
- **WHEN** 用户关闭这个标签页
- **THEN** 该运行在 3 秒内变为 `stopped`，端口可重新绑定
- 验证：test

#### Scenario: [RUN-OWNERSHIP-02] 手动停止后标签页仍开着
- 前提：标签页持有的运行处于 `ready`，标签页开着
- **WHEN** 用户手动停止
- **THEN** 运行变为 `stopped`，标签页不被关闭；再次启动时持有者仍是这个标签页
- 验证：test

### Requirement: 命令行持有的运行不受标签页影响
命令行持有的运行 MUST 在应用里被“查看”时保持持有者不变；关闭查看它的标签页 MUST NOT 停止它。“改为由我管理” MUST 把持有者从命令行改为该标签页；改后关闭标签页 MUST 停止它。
来源：PRD #prd-run-ownership

#### Scenario: [RUN-OWNERSHIP-03] 关闭查看命令行运行的标签页
- 前提：命令行启动了一个运行，应用里打开了它的标签页（`attach`）
- **WHEN** 关闭这个标签页
- **THEN** 运行继续，持有者仍是命令行
- 验证：test

#### Scenario: [RUN-OWNERSHIP-04] 改为由我管理
- 前提：命令行持有的运行，有标签页在查看
- **WHEN** 对它执行 `run.adopt`
- **THEN** 持有者变为该标签页；之后关闭标签页，运行在 3 秒内停止
- 验证：test

#### Scenario: [RUN-OWNERSHIP-05] 对命令行持有的运行从标签页启动
- 前提：项目有一个命令行持有的运行
- **WHEN** 应用里为同一个项目打开标签页并请求启动
- **THEN** 返回现有的运行（`alreadyRunning: true`），持有者保持命令行不变
- 验证：test

### Requirement: 退出应用时的停止
正常退出应用时，管理进程 MUST 停止这条连接名下所有标签页持有的运行，最多等 5 秒；命令行持有的运行 MUST 继续，由管理进程照看。
来源：PRD #prd-run-ownership

#### Scenario: [RUN-OWNERSHIP-06] 正常退出应用
- 前提：应用名下有两个标签页持有的运行，另有一个命令行持有的运行
- **WHEN** 应用发出 `session.bye` 并退出
- **THEN** 两个标签页持有的运行在 5 秒内都停止；命令行持有的运行仍在 `ready`
- 验证：test

### Requirement: 应用崩溃或被强杀时标签页持有的运行也要停止
连接异常断开后，管理进程 MUST 等待 5 秒（留给重连）；5 秒内没有重连，MUST 停止这条连接名下所有标签页持有的运行。命令行持有的运行 MUST NOT 受影响。“退出应用即停止”因此 MUST NOT 依赖应用正常退出。
来源：PRD #prd-run-ownership；ADR 0005

#### Scenario: [RUN-OWNERSHIP-07] 应用被强杀
- 前提：应用名下有一个标签页持有的运行和一个命令行持有的运行
- **WHEN** 应用进程被强制结束
- **THEN** 标签页持有的运行在连接断开后5 秒宽限期之后（不早于断开后 5 秒）停止；命令行持有的运行继续
- 验证：test

#### Scenario: [RUN-OWNERSHIP-08] 宽限期内重连
- 前提：应用的连接刚断开
- **WHEN** 同一个应用在 5 秒内重新连上
- **THEN** 它名下的运行不被停止
- 验证：test

### Requirement: 命令行持有的运行空闲后自动停止
空闲自动停止 MUST 只针对命令行持有的运行，默认空闲 30 分钟，时长取设置 `cliIdleStopMinutes`；标签页持有的运行 MUST NOT 做空闲停止。下面四项里任何一项 MUST 使计时归零：进程有输出；项目里的文件有变化；有命令提到它（`run`、`logs`、`status <名称>`、请求面板）；端口上有已建立的连接（每 60 秒采样一次）。应用里有标签页在查看它 MUST NOT 算活动。
来源：PRD #prd-idle-stop；PRD #prd-run-ownership

#### Scenario: [RUN-OWNERSHIP-09] 30 分钟没有任何活动
- 前提：命令行持有的服务处于 `ready`，设置为默认值，30 分钟内没有输出、文件变化、命令、连接
- **WHEN** 满 30 分钟
- **THEN** 运行按正常流程停止，日志加一条系统提示，`run.exit` 带 `reason: 'idle'`
- 验证：test

#### Scenario: [RUN-OWNERSHIP-10] 有输出时计时归零
- 前提：同上，已过去 29 分钟
- **WHEN** 进程打印了一行输出
- **THEN** 计时重新开始，再满 30 分钟才停止
- 验证：test

#### Scenario: [RUN-OWNERSHIP-11] 命令提到它也算活动
- 前提：同上，已过去 29 分钟
- **WHEN** 执行 `runyard logs <名称>`
- **THEN** 计时重新开始
- 验证：test

#### Scenario: [RUN-OWNERSHIP-12] 只有标签页在查看不算活动
- 前提：同上，应用里一直开着查看它的标签页，没有其他活动
- **WHEN** 满 30 分钟
- **THEN** 运行仍然被停止
- 验证：test

#### Scenario: [RUN-OWNERSHIP-13] 端口上有已建立的连接
- 前提：同上，一个外部客户端保持着到该端口的连接，每 60 秒采样一次能数到
- **WHEN** 满 30 分钟
- **THEN** 因连接算活动而没有停止
- 验证：test

#### Scenario: [RUN-OWNERSHIP-14] 改了空闲时长设置
- 前提：设置 `cliIdleStopMinutes` 改为 10
- **WHEN** 命令行持有的运行空闲满 10 分钟
- **THEN** 运行被停止
- 验证：test

#### Scenario: [RUN-OWNERSHIP-15] 标签页持有的运行不做空闲停止
- 前提：标签页持有的运行 `ready`，没有任何活动
- **WHEN** 满 30 分钟
- **THEN** 运行仍然 `ready`
- 验证：test

#### Scenario: [RUN-OWNERSHIP-16] 脚本不参与空闲停止
- **WHEN** 命令行持有的脚本跑完
- **THEN** 状态是 `finished`，不触发空闲停止流程
- 验证：test

### Requirement: 查看不改变持有者，也不是活动
`attach` 与 `detach` MUST NOT 改变持有者，MUST NOT 重置空闲计时。
来源：PRD #prd-idle-stop

#### Scenario: [RUN-OWNERSHIP-17] 查看不重置计时
- 前提：命令行持有的运行已空闲 29 分钟
- **WHEN** 一个标签页对它 `attach`
- **THEN** 持有者仍是命令行，计时不归零，1 分钟后运行仍被停止
- 验证：test
