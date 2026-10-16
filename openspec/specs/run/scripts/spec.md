# scripts Specification

## Purpose

约定脚本类项目（单文件脚本，运行器的 `kind` 为 `oneshot`）和服务有哪些不同：脚本没有就绪和端口，跑完就结束；保存后默认自动重新运行；代码有语法错误时不运行，保留上次输出并标为“过期”；运行中可以接收标准输入。状态、停止和失败的通用规则在 run/lifecycle；脚本不参与空闲停止，在 run/ownership；端口在 run/ports；输出日志在 run/logs。

## Requirements

### Requirement: 脚本没有就绪和端口，跑完即结束
脚本运行 MUST 经 `checking`（需要时再经 `installing`）进入 `running`，MUST NOT 经过 `starting`、`ready`、`reloading`；快照 MUST NOT 带 `port`、`url`、`readyMs`。进程以退出码 0 结束 MUST 进入 `finished`，以非 0 结束 MUST 进入 `errored`，两者的快照都 MUST 带 `exitCode`（被信号结束而没有退出码的除外）和 `durationMs`，且 MUST 保留这次运行的全部输出供读取。
来源：PRD #prd-script-projects；PRD #prd-status-and-ports；PRD #prd-decision-table（第 4 项）

#### Scenario: [RUN-SCRIPTS-01] 脚本不经过就绪
- 前提：一个 Python 脚本项目，工具齐全
- **WHEN** 启动它
- **THEN** 状态依次是 `checking`、`running`、`finished`，没有出现 `starting` 或 `ready`；快照里没有 `port`、`url`、`readyMs`
- 验证：test

#### Scenario: [RUN-SCRIPTS-02] 以退出码 0 结束
- 前提：脚本打印一行 `Hello` 后正常退出
- **WHEN** 启动它并等它结束
- **THEN** 状态 `finished`，`exitCode` 为 0，`durationMs` 有值；读日志能读到 `Hello`
- 验证：test

#### Scenario: [RUN-SCRIPTS-03] 以非零退出码结束
- 前提：脚本打印一行错误后以退出码 3 退出
- **WHEN** 启动它并等它结束
- **THEN** 状态 `errored`，`exitCode` 为 3，输出完整保留；它不是 `failed`，也不是 `crashed`；命令行退出码 6，错误码 `SCRIPT_ERRORED`
- 验证：test

#### Scenario: [RUN-SCRIPTS-04] 被信号结束
- 前提：脚本运行中被外部的信号结束，没有退出码
- **WHEN** 管理进程收到它的退出
- **THEN** 状态 `errored`，快照里没有 `exitCode`，结果的 `cause` 带信号名；不会自动重新运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-05] 已出错的脚本再次运行
- 前提：脚本上一次是 `errored`
- **WHEN** 修改后再次运行并以退出码 0 结束
- **THEN** 产生新的运行（新的 `runId`），状态 `finished`；上一次的 `errored` 结果不再是这个项目的当前结果
- 验证：test

#### Scenario: [RUN-SCRIPTS-06] 手动停止不算出错
- 前提：脚本正在 `running`
- **WHEN** 对它执行停止
- **THEN** 整棵进程树被结束，状态 `stopped`，不是 `errored`
- 验证：test

#### Scenario: [RUN-SCRIPTS-07] 打开脚本项目的标签页时运行一次
- 前提：脚本项目的“保存后自动运行”是开着的，标签页持有的运行不存在
- **WHEN** 用户在桌面应用里打开（切到）这个项目的标签页
- **THEN** 脚本运行一次，持有者是这个标签页；重新打开应用时恢复出来但没有切到的脚本标签页不运行
- 验证：manual（标签页属于桌面应用，M2 才有；管理进程一侧的“启动一次”由 RUN-LIFECYCLE-01 到 03 覆盖）

### Requirement: 保存后默认自动重新运行，开关可关
脚本项目 MUST 默认在磁盘上的文件变化后自动重新运行；每个脚本项目的开关（`script.autoRun`）和全局设置（`scriptAutoRun`）任何一个为关，该项目就 MUST NOT 自动运行：保存不重跑，打开标签页也不自动运行。自动运行关闭时，手动运行（命令行 `run`、运行按钮）MUST 仍然可用。重新运行 MUST 由磁盘上的文件变化驱动，不区分是用户还是智能体改的；运行器 `watch` 里声明要忽略的路径变化 MUST NOT 触发重跑。
来源：PRD #prd-script-projects；PRD #prd-run；PRD #prd-decision-table（第 4 项）

#### Scenario: [RUN-SCRIPTS-08] 默认保存即重跑
- 前提：脚本项目开关和全局设置都是默认值，上一次运行已 `finished`
- **WHEN** 脚本文件被保存
- **THEN** 产生新的运行，输出是新内容
- 验证：test

#### Scenario: [RUN-SCRIPTS-09] 智能体改文件和用户改文件效果一致
- 前提：同上，文件由另一个进程（模拟智能体）直接写入磁盘
- **WHEN** 文件内容变化
- **THEN** 同样触发重新运行，与应用内编辑器保存没有区别
- 验证：test

#### Scenario: [RUN-SCRIPTS-10] 项目上关闭开关
- 前提：这个项目的 `script.autoRun` 为 `false`，全局 `scriptAutoRun` 为 `true`
- **WHEN** 脚本文件被保存，随后打开它的标签页
- **THEN** 两次都没有自动运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-11] 全局设置关闭
- 前提：全局 `scriptAutoRun` 为 `false`，这个项目的开关没有单独设置
- **WHEN** 脚本文件被保存
- **THEN** 不自动运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-12] 关闭自动运行后仍可手动运行
- 前提：这个项目的 `script.autoRun` 为 `false`
- **WHEN** 执行 `runyard run <名称>`
- **THEN** 脚本正常运行到结束；这一次运行不改变开关的值
- 验证：test

#### Scenario: [RUN-SCRIPTS-13] 连续保存只重跑一次
- 前提：自动运行开着，运行器声明了合并连续变化的时间窗口
- **WHEN** 在窗口内连续保存同一个文件三次
- **THEN** 只产生一次新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-14] 被忽略路径的变化不触发
- 前提：运行器的 `watch` 声明忽略 `__pycache__` 目录，脚本自己会往那里写文件
- **WHEN** 该目录里的文件变化
- **THEN** 不触发重新运行，也不会因此形成“运行写文件、文件变化再运行”的循环
- 验证：test

### Requirement: 语法检查先于重新运行，不通过就不运行并标为过期
运行器声明了 `check` 的脚本，每次自动重新运行前 MUST 先执行它；`check` 以非 0 退出时 MUST NOT 运行脚本，MUST 保留上一次运行的输出、状态和退出码，并把这个项目的当前结果标为 `stale`，MUST NOT 产生新的运行。检查的输出 MUST 能被客户端读到。下一次检查通过并重新运行时 MUST 清除 `stale`。对 `.ts` 脚本，检查 MUST NOT 使用 `node --check`。手动运行遇到检查不通过时 MUST 同样不运行脚本，并返回 `SCRIPT_ERRORED`，`cause.outputTail` 带检查的输出。
来源：PRD #prd-script-projects；PRD #prd-run；技术设计 §4.4；ADR 0011

#### Scenario: [RUN-SCRIPTS-15] 保存了有语法错误的代码
- 前提：脚本上一次 `finished`，输出 `old`
- **WHEN** 保存一份有语法错误的文件
- **THEN** 脚本没有运行，没有新的 `runId`；快照仍是上一次的 `finished` 和退出码，带 `stale: true`，并发出 `run.state` 事件；读日志仍然读到 `old`，同时能读到检查的输出
- 验证：test

#### Scenario: [RUN-SCRIPTS-16] 修好之后恢复
- 前提：上一个场景之后，项目是 `stale`
- **WHEN** 保存修正后的文件
- **THEN** 检查通过，产生新的运行，快照不再带 `stale`
- 验证：test

#### Scenario: [RUN-SCRIPTS-17] 手动运行遇到语法错误
- 前提：脚本有语法错误
- **WHEN** 执行 `runyard run <名称> --json`
- **THEN** 脚本没有运行；错误码 `SCRIPT_ERRORED`，退出码 6，`cause.outputTail` 带检查的输出
- 验证：test

#### Scenario: [RUN-SCRIPTS-18] TypeScript 脚本的检查
- 前提：`node-ts` 项目，文件是合法的 `.ts`，带类型注解
- **WHEN** 执行检查
- **THEN** 检查通过；检查没有调用 `node --check`；对同一个文件里含 `enum` 的写法，检查不通过
- 验证：test

#### Scenario: [RUN-SCRIPTS-19] 没有声明检查的脚本
- 前提：运行器没有 `check`
- **WHEN** 保存一份有语法错误的文件
- **THEN** 脚本照常运行，以非 0 退出，状态 `errored`；不出现 `stale`
- 验证：test

### Requirement: 重新运行时上一次还没结束，先停旧的再起新的
自动重新运行触发时，如果这个项目上一次的脚本还在运行，系统 MUST 先按运行器的 `stop` 停止整棵旧进程树，确认为空，再起新的运行；MUST NOT 同时有两个进程在跑。这条不改变“对活动中的项目手动 `run` 返回现有运行并带 `alreadyRunning: true`”（RUN-LIFECYCLE-12）。
来源：PRD #prd-script-projects；PRD #prd-stop；技术设计 §4.3

#### Scenario: [RUN-SCRIPTS-20] 运行中保存
- 前提：脚本是一个会跑 30 秒的循环，正在 `running`
- **WHEN** 保存文件并触发自动重新运行
- **THEN** 旧进程树被整棵结束，旧的运行进入 `stopped`，随后新的运行进入 `running`；任何时刻只有一个脚本进程存活
- 验证：test

#### Scenario: [RUN-SCRIPTS-21] 手动 run 仍然返回现有运行
- 前提：脚本正在 `running`
- **WHEN** 执行 `runyard run <名称> --json`
- **THEN** 返回同一个 `runId`，`alreadyRunning` 为 `true`，没有重新启动
- 验证：test

### Requirement: 脚本可以接收标准输入
运行器声明 `run.stdin` 为 `true` 的脚本，在 `running` 时 MUST 能经 `run.stdin` 接收文本，原样写入进程的标准输入，系统 MUST NOT 自动补换行；每次新的运行 MUST 从空的输入开始。声明为 `false` 的运行器和服务类运行 MUST 拒绝并返回 `NOT_SUPPORTED`。没有这个 `runId` 的运行或已经结束的运行 MUST 返回 `RUN_NOT_FOUND`。
来源：PRD #prd-script-projects

#### Scenario: [RUN-SCRIPTS-22] 脚本读一行输入
- 前提：Python 脚本调用 `input()` 后打印读到的内容，正在 `running`
- **WHEN** 经 `run.stdin` 写入 `abc\n`
- **THEN** 脚本打印 `abc` 后以退出码 0 结束
- 验证：test

#### Scenario: [RUN-SCRIPTS-23] 不补换行
- 前提：脚本逐行读取标准输入，正在 `running`
- **WHEN** 经 `run.stdin` 写入 `abc`（不带换行）
- **THEN** 脚本此刻读不到完整的一行；再写入 `\n` 后才读到
- 验证：test

#### Scenario: [RUN-SCRIPTS-24] 服务不接收输入
- 前提：一个 `ready` 的服务
- **WHEN** 对它的 `runId` 调用 `run.stdin`
- **THEN** 返回 `NOT_SUPPORTED`，退出码 10
- 验证：test

#### Scenario: [RUN-SCRIPTS-25] 已结束的运行
- 前提：脚本已 `finished`
- **WHEN** 对它的 `runId` 调用 `run.stdin`
- **THEN** 返回 `RUN_NOT_FOUND`，退出码 3；没有任何内容被写入
- 验证：test

#### Scenario: [RUN-SCRIPTS-26] 重新运行不带上旧输入
- 前提：上一次运行收到过 `abc\n`
- **WHEN** 重新运行，脚本读标准输入
- **THEN** 脚本读不到上一次写入的内容，要等新的输入
- 验证：test

### Requirement: 自动重新运行的文件监听何时开始、何时结束
脚本项目的文件监听 MUST 从命令行 `runyard run <脚本项目>` 之后开始，到以下任何一件事发生时结束：`runyard stop` 停止了这个项目；项目被移到废纸篓；命令行启动的监听空闲满 `cliIdleStopMinutes`（默认 30 分钟）。空闲是指这段时间里项目文件夹没有文件变化，也没有命令行的命令提到这个项目（口径同 run/ownership 的空闲停止）；脚本不参与运行的空闲停止（RUN-OWNERSHIP-16），空闲结束的只是监听，不会停止任何运行。在桌面应用里，监听 MUST 跟随这个项目的标签页：标签页打开期间监听，关闭标签页就结束（桌面应用在 M2 落地）。没有被运行过、也没有在应用里打开的脚本项目 MUST NOT 被监听。监听期间保存文件触发的重新运行，按“重新运行时上一次还没结束，先停旧的再起新的”处理（RUN-SCRIPTS-20）。`script.autoRun` 或 `scriptAutoRun` 任何一个为关，该项目 MUST NOT 被监听。
来源：PRD #prd-script-projects；PRD #prd-run-ownership；PRD #prd-run

#### Scenario: [RUN-SCRIPTS-27] 命令行运行之后开始监听
- 前提：脚本项目开关和全局设置都是默认值，管理进程里没有人打开它的标签页
- **WHEN** 执行 `runyard run <名称>`，脚本跑完后再保存脚本文件
- **THEN** 产生新的运行，输出是新内容
- 验证：test

#### Scenario: [RUN-SCRIPTS-28] 没有运行过的项目不被监听
- 前提：脚本项目开关和全局设置都是默认值，从未被 `run`，也没有打开过标签页
- **WHEN** 脚本文件被保存
- **THEN** 不产生运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-29] `runyard stop` 之后不再监听
- 前提：脚本项目已经被命令行 `run` 过，正在被监听
- **WHEN** 执行 `runyard stop <名称>`，随后保存脚本文件
- **THEN** 保存后不产生新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-30] 移到废纸篓之后不再监听
- 前提：脚本项目已经被命令行 `run` 过，正在被监听
- **WHEN** 执行 `runyard rm <名称>` 把它移到废纸篓
- **THEN** 对该项目的监听结束，之后不产生新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-31] 命令行持有的运行被空闲停止之后不再监听
- 前提：脚本项目已经被命令行 `run` 过，正在被监听，`cliIdleStopMinutes` 为默认的 30
- **WHEN** 此后 30 分钟里没有文件变化，也没有命令行的命令提到它，之后再保存脚本文件
- **THEN** 保存后不产生新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-32] 桌面应用里随标签页监听
- 前提：在桌面应用里打开脚本项目的标签页，项目没有被命令行 `run` 过
- **WHEN** 标签页打开期间保存脚本文件，随后关闭标签页再保存一次
- **THEN** 第一次保存产生新的运行，第二次保存不产生新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-33] 项目的开关关闭时不监听
- 前提：这个项目的 `script.autoRun` 为 `false`，全局 `scriptAutoRun` 为 `true`
- **WHEN** 执行 `runyard run <名称>`，脚本跑完后保存脚本文件
- **THEN** 这一次 `run` 正常运行，保存后不产生新的运行
- 验证：test

#### Scenario: [RUN-SCRIPTS-34] 全局设置关闭时不监听
- 前提：全局 `scriptAutoRun` 为 `false`，这个项目的开关没有单独设置
- **WHEN** 执行 `runyard run <名称>`，脚本跑完后保存脚本文件
- **THEN** 这一次 `run` 正常运行，保存后不产生新的运行
- 验证：test
