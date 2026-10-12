# 0010. 移到废纸篓和回收站：macOS 用系统小工具，Windows 用随包小工具加预检

状态：已接受

日期：2026-10-12

来源：PRD #prd-retention、#prd-auto-clean、#prd-naming；技术设计 §4.7、§7.1“fs.trash”、§7.2 第 6 到 8 行、§12 第 16 项；依据与数字见 [证据](../evidence/0010-trash-and-delete.md)

## 背景

命令行和管理进程是不带原生模块的 Node，`runyard rm` 和自动清理都要求“只进废纸篓或回收站，绝不永久删除”。设计原先假设 macOS 上 `rename` 进 `~/.Trash`、Windows 上用 PowerShell 的 `DeleteDirectory(…SendToRecycleBin)`。技术验证 K9 在负责人的 Mac、`macos-26` 和 `windows-2025` 运行器上检验了这两条。

- macOS：`mkdir`、`rename` 进 `~/.Trash` 不弹框，三万个文件毫秒级，不能列目录（`EPERM`）；`rename` 不写“放回原处”记录，`/usr/bin/trash`（macOS 15 起）会写；`rename` 到同名空目录上会静默覆盖。
- Windows：外壳的“移到回收站”在路径过长（560 到 600 字符之间起）、目录超过回收站容量、用户关了回收站三种情形下静默永久删除，没有任何标志组合能改成失败；PowerShell 方案从 260 字符起就永久删除。约三万个文件进回收站约 10 秒（9.5 到 13 s），贴着 10 秒的线。
- Windows：改名在停掉 Vite 后 30/30 成功（最大 2.1 ms）；`fs.rename` 接受 `con`、`nul`、末尾带点或空格的名字。

## 决定

1. macOS：优先 `/usr/bin/trash`（保留“放回原处”）；没有时先 `mkdir` 占位再 `rename`，不对已有名字直接改名，不列目录；别的卷用 `<卷>/.Trashes/<uid>`；没有可用废纸篓目录时先复制再删原件。不用 `osascript`。
2. Windows：随包一个小的 `IFileOperation` 可执行文件，带进度回调，在某项不会进回收站时中止；调用前预检路径长度、总大小、回收站容量和“不移到回收站”设置。移除 PowerShell 方案。这个小工具与可选的 Job Object 函数是同一个可执行文件，在 Windows 预览版的里程碑里做。
3. 负责人 2026-10-12 的决定：Windows 上依赖目录（`node_modules` 及模板声明的同类目录）直接删除，其余进回收站，界面写明；这关闭了原 §12 第 16 项。
4. 改名失败码 `EBUSY`、`EPERM`、`EACCES` 归为 `PATH_LOCKED`；占用者靠读进程当前目录和命令行路径找，不靠 Restart Manager。
5. 名称由产品校验：所有系统都拒绝 Windows 保留名和末尾的点、空格。

## 后果

- 自动清理和 `rm` 只经平台层 `fs.trash`，任何情形都不退到永久删除；预检或回调拒绝时返回明确的错误码。
- Windows 需要一个随包的可执行文件，以及它的签名和杀毒误报问题；真机上复核之前，Windows 预览版不发。
- 三万个文件进回收站不保证 10 秒内；界面必须显示进度。
- 没有 `/usr/bin/trash` 的老 macOS 上没有“放回原处”，接受。
- 防线只在测过的三种情形里验证过；运行器是 Server 版管理员账号，普通用户、杀毒、长路径开关默认关的结果要真机确认（证据文档第 9、10 节）。

## 被否的方案

- `osascript` 调 Finder：要 Automation 权限，运行器上没弹框不能证明用户机器不弹。
- PowerShell 的 `SendToRecycleBin`：三种情形静默永久删除，且没有参数能改成失败。
- 靠标志位让外壳失败而不是永久删除：实验里所有组合要么永久删除，要么弹窗卡住。
- npm 的 `trash` 包：同样随包预编译小工具，没有预检，还多一串依赖（其传递依赖有高危公告）。
- 随包 Swift 小工具（macOS）：能做到同样效果，目前没有必要。
