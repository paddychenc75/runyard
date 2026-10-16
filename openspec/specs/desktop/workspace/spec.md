# desktop/workspace Specification

## Purpose
约定桌面应用里项目标签页的行为：打开标签页即运行，关闭标签页即停止（运行中的标签页关闭前要确认，可选“不再提示”），手动停止后标签页仍开着并可再运行；标签页里显示运行预览、进程输出和失败时的画面。资源库固定在第一个标签。管理进程一侧的持有者与停止时限见 run/ownership，本规格只管界面看得见的部分。

## Requirements

### Requirement: 打开标签页即运行
从资源库“打开”一个项目 MUST 新开它的标签页并启动运行，持有者是这个标签页；已经有它的标签页时 MUST 切到那个标签页而不是再开一个。资源库 MUST 固定在第一个标签，MUST NOT 能被关闭。
来源：PRD #prd-run-ownership；PRD #prd-decided-by-default

#### Scenario: [DESKTOP-WORKSPACE-01] 打开即运行
- 前提：项目 `demo` 已停止
- **WHEN** 在资源库里打开 `demo`
- **THEN** 新标签页出现并开始运行，运行的持有者是 `tab`
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-02] 已经打开的项目只切换
- 前提：`demo` 的标签页已开着
- **WHEN** 再次从资源库打开 `demo`
- **THEN** 切到已有的标签页，标签页总数不变，没有第二次启动
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-03] 资源库标签不能关闭
- **WHEN** 查看资源库标签
- **THEN** 它固定在第一个位置，没有关闭按钮，快捷键 `⌘W` 在它上面不起作用
- 验证：test

### Requirement: 关闭运行中的标签页前确认
关闭一个标签页持有的、正在运行的标签页之前，应用 MUST 弹出确认，写明关闭会停止运行、代码和文件不受影响，按钮是“取消”和“关闭并停止”，并提供“不再提示”勾选。确认后 MUST 关闭标签页并按 run/ownership 在 3 秒内停止运行；取消 MUST 保持标签页和运行不变。勾选“不再提示”并确认后，以后关闭运行中的标签页 MUST 直接停止，不再弹窗；勾选后取消 MUST NOT 记住这个选择。已停止的标签页和命令行持有的运行的查看标签页关闭时 MUST NOT 弹出确认。
来源：PRD #prd-close-tab-confirm；PRD #prd-run-ownership

#### Scenario: [DESKTOP-WORKSPACE-04] 关闭运行中的标签页弹出确认
- 前提：`demo` 的标签页持有的运行处于 `ready`，没有勾选过“不再提示”
- **WHEN** 关闭这个标签页
- **THEN** 弹出确认，写明会停止运行，有“取消”“关闭并停止”和“不再提示”；此时运行仍在 `ready`
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-05] 确认后停止
- 前提：确认弹窗已出现
- **WHEN** 点“关闭并停止”
- **THEN** 标签页关闭，运行在 3 秒内变为 `stopped`，端口可重新绑定
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-06] 取消什么都不变
- 前提：确认弹窗已出现
- **WHEN** 点“取消”
- **THEN** 弹窗关闭，标签页还在，运行仍是 `ready`
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-07] 不再提示
- 前提：确认弹窗已出现
- **WHEN** 勾选“不再提示”并点“关闭并停止”
- **THEN** 这次照常停止；之后再关闭另一个运行中的标签页，不弹窗，直接停止
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-08] 勾选后取消不记住
- 前提：确认弹窗已出现
- **WHEN** 勾选“不再提示”后点“取消”
- **THEN** 下次关闭运行中的标签页仍然弹出确认
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-09] 已停止的标签页直接关
- 前提：标签页开着，运行已手动停止
- **WHEN** 关闭这个标签页
- **THEN** 不弹确认，标签页关闭
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-10] 查看命令行持有的运行不弹确认
- 前提：命令行启动了一个运行，应用里打开了它的标签页
- **WHEN** 关闭这个标签页
- **THEN** 不弹确认，运行继续，持有者仍是命令行
- 验证：test

### Requirement: 手动停止与再次运行
标签页开着时手动停止 MUST 使运行变为已停止，标签页 MUST 保持打开，预览区 MUST 显示“运行”按钮；点“运行”MUST 再次启动，持有者仍是这个标签页。
来源：PRD #prd-run-ownership；PRD #prd-stop

#### Scenario: [DESKTOP-WORKSPACE-11] 停止后标签页仍开着
- 前提：标签页持有的运行处于 `ready`
- **WHEN** 点停止
- **THEN** 状态为已停止，标签页没有关闭，预览区出现“运行”按钮
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-12] 点“运行”重新启动
- 前提：上一个场景之后
- **WHEN** 点“运行”
- **THEN** 项目重新启动，持有者是 `tab`，端口沿用上次分配的
- 验证：test

### Requirement: 预览与脚本输出
有页面的项目（静态页面、前端开发服务器、服务）就绪后 MUST 在预览区显示页面；预览只加载本机地址，其他网页链接 MUST 交给系统浏览器。脚本项目 MUST 没有预览，显示输出：运行时是“运行中”，跑完是“已结束”并显示退出码和耗时。
来源：PRD #prd-run；PRD #prd-script-projects；PRD #prd-status-and-ports

#### Scenario: [DESKTOP-WORKSPACE-13] 就绪后显示页面
- 前提：`html` 项目刚创建并运行
- **WHEN** 运行变为 `ready`
- **THEN** 预览区显示该页面的内容
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-14] 外部链接交给系统浏览器
- 前提：预览里的页面有一个指向外部网站的链接
- **WHEN** 点这个链接
- **THEN** 链接在系统默认浏览器里打开，预览区不跳转
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-15] 脚本跑完显示已结束
- 前提：一个 `node-ts` 脚本项目，打开它的标签页
- **WHEN** 脚本运行结束
- **THEN** 没有预览区；显示输出、状态“已结束”、退出码和耗时
- 验证：test

### Requirement: 控制台显示进程输出
标签页 MUST 有控制台，实时显示这次运行的进程输出，包括安装和启动阶段的输出；切换标签页再回来、关闭应用再打开后，MUST 仍能看到这次运行已记录的输出。控制台显示的是读取时清洗过的文本（见 run/logs）。
来源：PRD #prd-request-panel；PRD #prd-run

#### Scenario: [DESKTOP-WORKSPACE-16] 输出实时出现
- 前提：一个会每秒打印一行的脚本项目正在运行
- **WHEN** 查看控制台
- **THEN** 新的输出行在产生后不久出现，不需要手动刷新
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-17] 切走再回来输出还在
- 前提：控制台已有输出
- **WHEN** 切到资源库标签再切回
- **THEN** 之前的输出还在，并继续显示新的输出
- 验证：test

### Requirement: 失败状态的画面
运行失败 MUST NOT 使项目不可编辑，预览区 MUST 对下面四种情况各有明确的画面，说明原因并给出下一步操作：缺少运行环境（写明缺哪个工具、需要什么版本、当前版本，以及当前系统的安装命令；操作：复制命令、重新检测）；依赖安装失败（启动清单停在“安装”并标红，显示输出的最后几行；操作：重试、查看输出）；启动超过 30 秒仍未就绪（保持“启动中（较慢）”并显示日志，不算失败；操作：停止、查看输出）；运行中崩溃（保留最后一帧并盖一层提示，写明退出原因；操作：重新运行、查看输出）。端口被占用时 MUST NOT 算失败，而是自动改用下一个空闲端口，并在预览区上方说明原端口被谁占用、现在用的端口。
来源：PRD #prd-failure-states；PRD #prd-ports；PRD #prd-missing-runtime-prompt

#### Scenario: [DESKTOP-WORKSPACE-18] 缺少运行环境
- 前提：本机没有 `node`，打开一个需要它的项目
- **WHEN** 项目启动
- **THEN** 预览区写明缺 node、需要的版本和当前系统的安装命令，有“复制命令”和“重新检测”
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-19] 依赖安装失败
- 前提：依赖安装会失败（如离线且无缓存之外的错误）
- **WHEN** 安装阶段失败
- **THEN** 启动清单停在“安装”并标红，显示输出的最后几行，有“重试”和“查看输出”
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-20] 启动较慢不算失败
- 前提：服务 30 秒内一直没有就绪，进程还活着
- **WHEN** 满 30 秒
- **THEN** 状态显示“启动中（较慢）”并继续显示日志，没有出现失败画面
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-21] 运行中崩溃
- 前提：服务已就绪，预览里有页面
- **WHEN** 服务进程意外退出
- **THEN** 预览区保留最后一帧并盖一层提示，写明退出原因，有“重新运行”和“查看输出”
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-22] 端口被占用时自动改用
- 前提：项目记着的端口被另一个程序占用
- **WHEN** 启动
- **THEN** 项目在下一个空闲端口启动，预览区上方说明原端口被谁占用和现在用的端口，没有失败画面
- 验证：test

### Requirement: 关闭窗口与退出应用
在 macOS 上关闭窗口 MUST NOT 退出应用，也 MUST NOT 停止运行；点 Dock 图标 MUST 重新显示窗口。退出应用（`⌘Q`）MUST 停止所有标签页持有的运行，命令行持有的运行 MUST 继续。
来源：PRD #prd-run-ownership

#### Scenario: [DESKTOP-WORKSPACE-23] 关闭窗口后运行继续
- 前提：一个标签页持有的服务运行中
- **WHEN** 点窗口左上角的红色关闭按钮
- **THEN** 应用仍在运行，该服务仍是 `ready`；点 Dock 图标，窗口回来，标签页还在
- 验证：test

#### Scenario: [DESKTOP-WORKSPACE-24] 退出应用停止标签页的运行
- 前提：一个标签页持有的运行，和一个命令行持有的运行
- **WHEN** 按 `⌘Q`
- **THEN** 标签页持有的运行在 5 秒内停止，命令行持有的运行继续
- 验证：test
