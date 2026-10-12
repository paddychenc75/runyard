# lifecycle Specification

## Purpose

约定后台管理进程（supervisor）怎样被发现、被启动、保持只有一个、在没有人需要时退出，以及崩溃后怎样收拾残局。桌面应用和命令行都只是它的客户端，谁先需要谁启动；应用退出后命令行持有的运行仍由它照看。这里只写外部能观察到的行为。

## Requirements

### Requirement: 同一个配置档同时只有一个管理进程
同一个 profile（正式版或开发版）下同时存活的管理进程 MUST 至多一个。只有拿到内核锁的进程 MUST 被允许删除残留的 socket 文件并监听（macOS 用文件锁，Linux 用抽象命名空间 socket）。
来源：PRD #prd-decided-by-default；ADR 0005

#### Scenario: [SUPERVISOR-LIFECYCLE-01] 两个启动者同时启动
- 前提：当前没有管理进程
- **WHEN** 桌面应用和命令行在同一时刻都发现没有管理进程并各自启动一个
- **THEN** 最终只有一个管理进程存活，另一个自己退出，两个客户端连上的是同一个
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-02] 残留 socket 文件加并发启动
- 前提：macOS 上，上一个管理进程被强杀，留下 `supervisor.sock` 文件，没有进程持有锁
- **WHEN** 两个启动者同时启动
- **THEN** 只有拿到锁的一个删除残留文件并监听；不会出现第二个监听者
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-03] 锁随进程死亡释放
- 前提：管理进程被强杀
- **WHEN** 之后再有客户端启动新的管理进程
- **THEN** 新进程能拿到锁并正常监听，不需要任何人工清理
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-05] 连接点被不知道口令的进程抢先占住
- 前提：别的进程先占住了连接点（socket 路径）
- **WHEN** 管理进程尝试启动，或客户端尝试连接
- **THEN** 管理进程起不来（功能不可用），客户端握手失败并报 `SUPERVISOR_UNAVAILABLE`；口令没有被发送给占位者
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-06] 开发版和正式版互不干扰
- **WHEN** 同一台电脑上同时启动开发版和正式版的管理进程
- **THEN** 两者各有自己的连接点和发现文件，互不影响
- 验证：test

### Requirement: 谁先需要谁启动，并与启动者脱钩
客户端 MUST 先读发现文件并尝试连接，连不上才启动管理进程。管理进程 MUST 与启动者脱钩：启动者退出后它 MUST 继续存活。启动参数 MUST 只走命令行参数，工作目录 MUST 是状态目录。
来源：PRD #prd-decided-by-default；PRD #prd-run-ownership；ADR 0005

#### Scenario: [SUPERVISOR-LIFECYCLE-07] 命令行先需要它
- 前提：没有管理进程，应用也没有运行
- **WHEN** 用户执行一条需要管理进程的命令行命令
- **THEN** 命令行启动管理进程并完成请求；命令行进程退出后管理进程仍在
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-08] 启动者被强杀
- 前提：管理进程由某个进程启动
- **WHEN** 启动者的整个进程组被强制结束
- **THEN** 管理进程仍然存活，已有的运行不受影响
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-10] 启动期间连接失败
- 前提：管理进程正在启动，尚未开始监听
- **WHEN** 客户端第一次连接失败
- **THEN** 客户端在启动超时之前重试连接；超时仍连不上则报 `SUPERVISOR_UNAVAILABLE`
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-11] 发现文件的内容和权限
- **WHEN** 管理进程完成监听
- **THEN** 发现文件已写好（先写临时文件再改名），含进程号、连接点、口令、协议版本、产品版本、构建标识、由谁启动及其可执行文件路径，且只有本人可读
- 验证：test

### Requirement: 没有连接也没有运行时自己退出
管理进程 MUST 在没有任何连接且没有任何活动运行满 60 秒后自己退出。只要有一个连接，或有一个运行，MUST NOT 退出。
来源：实现细节

#### Scenario: [SUPERVISOR-LIFECYCLE-12] 空闲 60 秒后退出
- 前提：没有连接，没有运行
- **WHEN** 经过 60 秒
- **THEN** 管理进程退出，发现文件和锁被释放
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-13] 命令行持有的运行让它留着
- 前提：没有连接，但有一个命令行持有的运行
- **WHEN** 经过 60 秒
- **THEN** 管理进程仍然存活
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-14] 60 秒内有新连接
- 前提：没有连接，没有运行，已过去 59 秒
- **WHEN** 一个客户端连上
- **THEN** 管理进程不退出；之后重新从零开始计时
- 验证：test

### Requirement: 只在空闲时才响应“有条件关闭”
收到 `supervisor.shutdown { ifIdle: true }` 时，管理进程 MUST 只在没有运行时退出；有运行时 MUST 拒绝退出并保持服务。
来源：ADR 0005

#### Scenario: [SUPERVISOR-LIFECYCLE-15] 有运行时拒绝关闭
- 前提：有一个运行
- **WHEN** 收到 `supervisor.shutdown { ifIdle: true, reason: 'upgrade' }`
- **THEN** 管理进程不退出，运行不受影响，响应说明未关闭
- 验证：test

### Requirement: 崩溃后的清理按身份核对
管理进程启动时 MUST 读取上次留下的运行记录，逐个核对进程号和进程启动时间；两者都一致且进程仍活着的，MUST 结束它的整棵进程树并把对应运行标为 `crashed`；不一致的 MUST NOT 被结束；MUST NOT 重新接管仍活着的进程。
来源：PRD #prd-run；ADR 0006；ADR 0005

#### Scenario: [SUPERVISOR-LIFECYCLE-16] 管理进程被强杀后下次启动清理
- 前提：管理进程被强杀，它的子进程树仍在运行，运行记录还在
- **WHEN** 新的管理进程启动
- **THEN** 子进程树被整棵结束，运行标为 `crashed`，端口可以重新绑定
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-17] 进程号被复用
- 前提：运行记录里的进程号现在属于另一个无关进程，进程启动时间与记录不符（进程号会被复用）
- **WHEN** 新的管理进程启动并清理
- **THEN** 这个无关进程没有被结束；该运行只被标为 `crashed`
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-18] 发现文件被删而管理进程仍活着
- 前提：发现文件被删除，管理进程仍在运行
- **WHEN** 客户端要连接
- **THEN** 客户端没有口令，不发握手消息，也无法使用这个管理进程（已知空白，不承诺自动恢复）
- 验证：manual（这是 ADR 0005 登记的已知空白，没有对策；记录行为以便以后改进）
