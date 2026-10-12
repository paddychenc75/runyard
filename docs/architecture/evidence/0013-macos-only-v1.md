# 0013 证据：以后做 Windows 要做什么，和 M1 规格里退役的 Windows 场景

本文件不是第一版的规则。它把 0005 到 0010 及技术设计里已经量到、写下的 Windows 结论整理成一张有序清单，让以后的 Windows 工作是“已知数量”。决策见 [0013](../decisions/0013-macos-only-v1.md)。每一项的事实和数字仍以原来的记录为准，这里只给出处，不重复。

## 附录 A　以后做 Windows 的有序清单

先决条件：负责人的 Windows 电脑（系统版本和芯片见技术设计 §7.5“还不知道的两件事”）；技术设计 §12 里标“推迟”的七项负责人决定重新确认，原回答作为输入（只承诺 Windows 11；最小适配的外观；内置终端默认 PowerShell；关闭最后一个窗口即退出；Windows 速度目标单独设定；放不进回收站时的规则；依赖目录直接删除）。

1. 重新量一遍。0005 到 0010 的 Windows 数字都来自 `windows-2025`（Windows Server，管理员账户）的 CI 机器，只是近似；动手前先按下面第 13 项的真机清单里“必须在预览版发布前”的 11 项在真机上复核一遍，再决定接口要不要改（接口是在没有第二个发布实现的情况下设计的，见 0013 的后果）。
2. 平台包里新增 `win32` 实现目录（与 `darwin`、`linux` 并列）：按接口成员逐个实现，并让同一组契约测试通过。各区域的要点：
   - `paths`：默认 260 字符上限（保守取 248），保留设备名；名称校验在第一版已经所有系统一致（0010 第 5 条）。
   - `env`：进程继承完整环境；“重新检测”时从注册表重读 `Path`，不要求重启（技术设计 §4.8）。
   - `exec`：`.cmd` 垫片包一层 `cmd.exe` 并按两层规则转义；一律 `windowsHide`；`spawnDetached` 默认普通方式，发现启动者把子进程放进“关闭即杀”的 Job Object 时改经 `Win32_Process.Create`（WMI，多 0.4 到 1.6 秒；0005 第 4 条）。原因：普通方式启动的管理进程会随放它进 Job 的启动者一起死，经 WMI 创建的活下来了；这个选择只在 Windows 实现内部，`spawnDetached` 的接口没有对应选项（“脱钩”本身就包含这个要求）。运行器直接用 `node` 跑入口文件，绕开 `pnpm.cmd`（0006）。
   - `proc`：先核对 pid 和创建时间，再 `taskkill /PID <pid> /T /F`，等 exit 事件，再按端口复查；结束任何进程前必须同时核对 pid 和创建时间（K2 的事故，0006）。不用信号，所以接口里本来就没有。
   - `ports`：绑定报“无权限”判为 `reserved`（原因 `PORT_RESERVED`）；占用者靠 `netstat`；只探测 `127.0.0.1` 和 `::1`。
   - `fs`：`moveDir` 的 `EBUSY`、`EPERM`、`EACCES` 归为 `PATH_LOCKED`，占用者靠读进程当前目录和命令行路径找，不靠 Restart Manager；`trash` 见第 3 项；`watch` 在 `dispose` 之后句柄必须已释放；大量事件突发时可能丢事件，按“全部重扫”处理。
   - `ipc`：命名管道 `\\.\pipe\runyard-<profile>-<用户标识>`，管道本身就是锁，名字固定。已接受的风险：默认访问控制表允许所有人只读打开，纯 Node 改不了；握手不泄露口令，见 0005。普通用户下的实际访问控制表要在真机上看。
   - `tools`：除 `PATH` 外查固定位置和注册表；商店占位的 `python.exe` 判为未安装；有 `py` 启动器。
   - `shell`：PowerShell（有 7 用 7，否则 5.1）；`desktop`：在文件资源管理器中显示、终端、编辑器；`cli.installShim`：改注册表里用户的 `Path`（保持值类型，只增删自己那一段，不用 `setx`，0007 第 4 条）。
3. 随包辅助程序 `runyard-helper.exe`（暂定名）：回收站部分用 `IFileOperation` 加进度回调，在某项不会进回收站时中止（`PreDeleteItem`），调用前预检路径长度、总大小、回收站容量和“不移到回收站”设置，放不进就失败、绝不永久删除（0010 第 2 条）；依赖目录（`regenerable`）直接删除是负责人的决定，要在做的时候再确认。可选的 Job Object 部分的三条要求见技术设计 §7.2 表后。语言 C 或 Rust 在做时定；在 `windows-2025` 上构建，产物和校验和提交进仓库，放在 `win32` 实现目录的 `bin/` 下；它是资源文件，不是 Node 模块。先看杀毒软件会不会误报（K14）。
4. 安装器：NSIS，按用户安装，不要管理员；钩子 `customCheckAppRunning`（先调 `bin\runyard.cmd installer-stop` 请管理进程退出，再展开原来的检查）、`customInstall`（登记链接协议）、`customUnInstall`（非覆盖安装时清理 `PATH`、链接协议、更新缓存目录）（0007 第 5 条）。安装目录取桌面应用包的 `package.json` 的 `name`；`allowBuilds` 要加 `electron-winstaller: false`。
5. 命令行启动脚本：`bin\` 里 `runyard.cmd`（只含 ASCII）加一个没有扩展名的 `runyard` 脚本（Git Bash 不认 `.cmd`），不放 `.ps1`（执行策略 `Restricted` 时整个不能用）；PowerShell 经 `.cmd` 传参时 `&`、`^` 等字符会被改写，是已知限制，彻底解决要带一个控制台程序做入口（0007）。
6. 管理进程的存活：K1 的真机部分（四种终端各启动后关闭终端、黑窗口、普通用户）；构建标识比对已在 0007 里按所有系统设计。
7. pid 加创建时间：第 2 项 `proc` 已含；管理进程崩溃后的残留清理在 macOS 上同样按 pid 加启动时间核对，规则本身已在第一版实现。
8. Python 环境变量：`PYTHONUTF8=1`、`PYTHONUNBUFFERED=1` 第一版已经给所有系统，不用再做（0008）。
9. 日志解码：切行时先严格 UTF-8、失败再 GB18030 的规则已在第一版的清洗函数里；需要的是在中文 Windows 11（代码页 936）真机上复核实际字节（0008）。
10. 界面适配：窗口按钮用系统画的右上角三个，顶栏让位；窗口圆角、字体栈（Segoe UI、微软雅黑、Cascadia Mono）、0.5 px 线改 1 px、自定义滚动条放进 `tokens.json` 的 `platform.win32` 一节；不显示菜单栏，用系统原生菜单；不用 Mica；快捷键 `⌘` 换 `Ctrl`（例外：移到回收站是 `Delete`，关闭标签另加 `Ctrl+F4`，补全另加 `Ctrl+I`）；`Ctrl+C` 在终端里有选区时复制否则中断；文案走 `platform.json` 的 `win32` 一支（“回收站”“文件资源管理器”“任务栏”）；设计稿补 Main、工作区（浅色和深色）、Settings、Missing 四到五张和 Windows 图标；Windows 机器上的基准图（技术设计 §7.3、§6.7、§6.8）。
11. 工具安装提示：winget、Scoop、官网链接的顺序和各工具命令（技术设计 §7.4）；`RUNTIME_MISSING` 的提示命令（缺 VC++ 运行库）；设置页“运行环境”表多一列架构。
12. CI 与发布：去掉平台相关测试在 Windows 上的跳过标记并让它们通过；加 `windows-11-arm` 的打包；构建 Windows x64 和 arm64 的 NSIS 包；下载页和发布说明加 Windows；写明未签名的后果（SmartScreen、智能应用控制，不做自动更新，技术设计 §10）。
13. 20 项真机验证：清单原文在技术设计“以后：Windows 支持”一节（原在 §11.1）。
14. 最后一步：用真机结论回看接口，把必须的接口改动写成新的决策记录。

## 附录 B　M1 规格里退役的 Windows 场景（原文）

来源：规格 PR #57。以下内容原样取自移出之前的版本。

以下是第一批 M1 规格（PR #57）里只在 Windows 上成立的场景与条款，按 2026-10-12 的决定（第一版只做 macOS，决策记录 0013）从 规格目录（仓库根 `openspec` 下的 `specs`） 移出。内容照原文保留，作为以后做 Windows 支持时重写规格的输入；这些场景编号已退役，永远不再复用。本附录不是现行行为的描述，现行行为只看 规格目录（仓库根 `openspec` 下的 `specs`）。

说明：整条要求都只属于 Windows 的，连同它的场景一起列在下面；要求里夹着的 Windows 句子，列出原句，并写明现行规格里改成了什么。

### supervisor/lifecycle（管理进程的生命周期）

#### 要求：同一个配置档同时只有一个管理进程（Windows 条款，原文）

同一个 profile（正式版或开发版）下同时存活的管理进程 MUST 至多一个。macOS 和 Linux 上，只有拿到内核锁的进程 MUST 被允许删除残留的 socket 文件并监听；Windows 上，命名管道本身 MUST 作为锁。
来源：PRD #prd-decided-by-default；ADR 0005

原要求正文中被删去的 Windows 句子是“Windows 上，命名管道本身 MUST 作为锁。”，现行规格只保留 macOS 和 Linux 的内核锁。

#### Scenario: [SUPERVISOR-LIFECYCLE-04]（已退役，编号不再复用） Windows 上第二个监听失败
- 前提：Windows 上已有管理进程占着命名管道
- **WHEN** 第二个管理进程尝试监听同名管道
- **THEN** 监听失败，第二个进程退出，原管理进程不受影响
- 验证：test

#### Scenario: [SUPERVISOR-LIFECYCLE-09]（已退役，编号不再复用） 启动者在“关闭即杀”的作业里
- 前提：Windows 上，启动者把子进程放进“关闭即杀”的作业对象
- **WHEN** 普通方式启动的管理进程随启动者一起被结束，客户端发现后改经 WMI 创建，然后启动者退出
- **THEN** 经 WMI 创建的管理进程仍然存活
- 验证：manual（需要 Windows 真机逐个检查 Claude Code、VS Code 终端、Windows Terminal、Git Bash 四种启动者）

场景 `SUPERVISOR-LIFECYCLE-05` 原文前提中的“管道名或”、场景 `SUPERVISOR-LIFECYCLE-17` 原文前提中的“（Windows 上进程号会很快被复用）”两处，在现行规格里删去了 Windows 字样，场景本身保留。


### run/lifecycle（运行的生命周期）

#### Scenario: [RUN-LIFECYCLE-17]（已退役，编号不再复用） Windows 上进程号被复用
- 前提：Windows 上，记录的根进程号现在属于另一个无关进程，创建时间与本次运行启动时记下的不同
- **WHEN** 执行停止
- **THEN** 创建时间不符的进程没有被结束；该运行按已退出处理
- 验证：test

#### Scenario: [RUN-LIFECYCLE-18]（已退役，编号不再复用） Windows 上结束整棵树再复查端口
- 前提：Windows 上一个服务进程树有多层进程
- **WHEN** 执行停止
- **THEN** 先核对根进程的进程号和创建时间，再结束整棵树，等退出事件，再试绑端口；端口绑不上时，只结束创建时间晚于本次运行启动的监听者
- 验证：test


### run/ports（端口）

#### 要求：被系统保留的端口当作被占用（Windows 条款，原文）

绑定端口时报“无权限”而不是“已占用”的，系统 MUST 判为被系统保留，MUST 换下一个端口，原因 MUST 记为 `PORT_RESERVED`，且没有占用者。
来源：PRD #prd-ports；PRD #prd-failure-states

#### Scenario: [RUN-PORTS-10]（已退役，编号不再复用） Windows 上端口被系统保留
- 前提：Windows 上登记的端口落在系统保留的段里（绑定报无权限）
- **WHEN** 启动该项目
- **THEN** 项目用别的端口运行；`portFallback` 的原因是 `PORT_RESERVED`，没有占用者；不是错误
- 验证：test


### run/logs（运行日志）

#### Scenario: [RUN-LOGS-10]（已退役，编号不再复用） 非 UTF-8 的 Windows 上 Python 打印中文
- 前提：Windows 上系统代码页不是 UTF-8，一个 Python 脚本打印中文
- **WHEN** 运行该脚本
- **THEN** 脚本不崩溃，日志里的中文可读
- 验证：test

现行规格新增 `RUN-LOGS-21`（子进程环境带 UTF-8 与不缓冲的开关）替代它对环境变量的覆盖；“Windows 代码页不是 UTF-8 时 Python 打印中文不崩”这一行为本身只能在 Windows 上验证，留在这里。


### library/playgrounds（项目）

#### Scenario: [LIBRARY-PLAYGROUNDS-18]（已退役，编号不再复用） 文件夹被其他程序占用
- 前提：Windows 上另一个程序占着项目文件夹（当前目录在里面，或打开着里面的文件）
- **WHEN** 重命名
- **THEN** 报 `PATH_LOCKED`，退出码 9；文件夹仍叫原名，内容完好
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-21]（已退役，编号不再复用） 回收站放不进（路径过长）
- 前提：Windows 上项目里有一条超过预检上限的长路径
- **WHEN** 执行 `rm`
- **THEN** 报 `PATH_TOO_LONG`，退出码 9；没有任何内容被永久删除，项目仍在资源库里
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-22]（已退役，编号不再复用） 回收站放不进（容量不足或被关闭）
- 前提：Windows 上项目总大小超过回收站容量，或用户关闭了回收站
- **WHEN** 执行 `rm`
- **THEN** 报 `TRASH_UNAVAILABLE`，退出码 9；项目文件夹里不可重新生成的内容原样保留，没有任何内容被永久删除
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-23]（已退役，编号不再复用） Windows 上依赖目录直接删除，其余进回收站
- 前提：Windows 上项目有 `node_modules` 和源文件，回收站可用
- **WHEN** 执行 `rm`
- **THEN** `node_modules` 被直接删除，其余内容在回收站里；结果里 `deletedRegenerable` 列出被直接删除的目录
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-25]（已退役，编号不再复用） 文件夹被占用时不移走
- 前提：Windows 上项目文件夹被其他程序占用
- **WHEN** 执行 `rm`
- **THEN** 报 `PATH_LOCKED`，项目原样保留
- 验证：test

要求“移到废纸篓”原文中被删去的 Windows 句子：“Windows 上依赖目录（`node_modules` 及模板声明的同类可重新生成的目录）MUST 直接删除，其余内容 MUST 进回收站。回收站放不进（路径过长、超过回收站容量、回收站被关闭）时 MUST 失败并返回明确的错误码，项目文件夹中不可重新生成的内容 MUST 原样保留，MUST NOT 退到永久删除。”现行规格保留“放不进废纸篓时失败、不退到永久删除”的平台无关部分，并新增场景 `LIBRARY-PLAYGROUNDS-31`、`LIBRARY-PLAYGROUNDS-32` 用假平台覆盖。


### toolchain/detection（工具链检测）

要求“只有执行版本命令并解析出版本号才算找到”原文中被删去的句子：“Windows 上微软商店的占位 `python.exe` MUST 判为未安装。”

#### Scenario: [TOOLCHAIN-DETECTION-07]（已退役，编号不再复用） Windows 商店占位程序
- 前提：Windows 上 PATH 里的 `python.exe` 是微软商店的占位程序
- **WHEN** 检测 Python
- **THEN** 判为未安装，不把占位程序当作解释器
- 验证：test

#### 要求：Windows 上重新检测不要求重启（Windows 条款，原文）

Windows 上进程本来就继承完整环境；用户新装工具后，“重新检测”MUST 从注册表重新读取环境，MUST NOT 要求重启应用。
来源：PRD #prd-settings-toolchain；PRD #prd-runtime-requirements

#### Scenario: [TOOLCHAIN-DETECTION-21]（已退役，编号不再复用） 运行期间新装了工具
- 前提：Windows 上应用已运行，用户随后装了 Go
- **WHEN** 执行重新检测
- **THEN** 从注册表读到新的用户环境，找到 Go，不需要重启应用
- 验证：test
