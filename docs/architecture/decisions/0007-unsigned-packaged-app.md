# 0007. 未签名安装包的打包方式、内置命令行入口和安装器钩子

状态：已接受

日期：2026-10-12

来源：PRD #prd-release-plan；技术设计 §2.3、§5.4、§6.5、§8.1、§8.2、§10、§11.1 的 K3

## 背景

负责人决定第一版不签名。技术验证 K3 在负责人的 Mac（macOS 27.0.1）和 CI 的 `macos-26`、`windows-2025`（Windows Server，不是用户的电脑）上实测：未签名的包能做到哪一步；用应用自带的运行时执行命令行是否够快、会不会多出 Dock 图标；管理进程活着时安装、升级、卸载会怎样。数字、环境、运行链接（PR #7，CI 运行 38189046820）和伪代码见 [证据文档](../evidence/0007-unsigned-packaged-app.md)。

## 决定

管理进程和内置命令行继续用应用自带的运行时（`ELECTRON_RUN_AS_NODE=1`），不随应用另带独立的 Node。命令行 `--version` 中位数 macOS 54 到 91 毫秒、Windows 64 到 81 毫秒（上限 150），没有 Dock 图标。在此基础上定七条：

1. macOS 签名：配置里明确写 `mac.identity: "-"`，打包开关里开 `resetAdHocDarwinSignature`，打包后用 `codesign --verify --deep --strict` 校验，不过就让构建失败。electron-builder 26.17.0 不会自动 ad-hoc 签名；改了开关没重签的包在 macOS 27 上一启动就被系统杀掉。
2. 打包开关：`runAsNode` 开；`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments`（正式构建）、`grantFileProtocolExtraPrivileges` 关；`onlyLoadAppFromAsar`、`enableEmbeddedAsarIntegrityValidation` 开。界面只从 `app://runyard/` 加载（关掉 `grantFileProtocolExtraPrivileges` 后 `file://` 读不到 asar）。
3. 命令行入口：macOS 是 `Contents/Resources/bin/runyard`（shell 脚本，PATH 上的符号链接指向它）；Windows 是 `bin\` 里的 `runyard.cmd`（只含 ASCII）加一个没有扩展名的 `runyard` 脚本（Git Bash 不认 `.cmd`）。不放 `.ps1`。
4. Windows 的 PATH 由应用直接改注册表里用户的 `Path`（保持值类型，只增删自己那一段，不用 `setx`）；安装器不动它。
5. NSIS 钩子 `customCheckAppRunning`：先调 `bin\runyard.cmd installer-stop` 请管理进程退出，再展开原来的检查；`customInstall` 登记链接协议；`customUnInstall` 在非覆盖安装时清理 PATH、链接协议、更新缓存目录。
6. 判断管理进程是否过旧，除协议版本外在发现文件里加构建标识（版本号加构建时的随机串）；路径不存在只是其中一种情况。
7. 下载页写明：macOS 上先把应用拖进“应用程序”再打开。

## 后果

- 钩子是必做项：不加时覆盖安装和卸载都报成功，但旧管理进程和运行还活着，卸载后留下删不掉的可执行文件。加钩子后安装、卸载会停掉所有运行，安装器要事先说明个数。
- PowerShell 经 `runyard.cmd` 传参时，不带空格又含 `&`、`^` 等字符的参数会被 cmd 改写；已知限制，写进命令行说明。彻底解决要带一个控制台程序做入口，与 Windows 辅助可执行文件（决策记录 0006）一起决定。
- 未签名的 macOS 应用发不出系统通知（实测），不用系统通知的决定不变；应用在临时目录运行时 `runyard://` 不会交给它。
- 由应用拉起的管理进程启动的运行，在 macOS 看来是 Runyard 在访问文件；项目放在桌面、文稿、下载里会被问一次授权，更新后是否重问未验证。
- `runAsNode` 是硬依赖：关掉它，管理进程和内置命令行都起不来（实测）；升级 Electron 时要核对这个开关。
- 桌面应用包的 `package.json` 的 `name` 决定 Windows 安装目录名；`allowBuilds` 要加 `electron-winstaller: false`。
- electron-builder 的间接依赖 `http-cache-semantics` 4.2.0 有高危公告，修复版 2026-10-18 才满 14 天，在那之前带它的锁文件过不了审计。
- 未验证、留给真机和 K14：Gatekeeper 与 SmartScreen 的实际画面、真实浏览器里点链接、普通 Windows 用户、Defender 实时防护下的耗时、黑窗口、钩子里“5 秒后强行结束”一支。

## 被否的方案

- 随应用另带独立的 Node：没有需要它的理由，还要多约 100 MB。
- 依赖打包工具自己签名，或依赖改开关时顺带的重签：前者不发生，后者是副作用。
- 只靠打包工具自带的“应用还在运行”检查：只剩一个进程时找不到；找到时直接结束，管理进程来不及停运行。
- Windows 上加 `runyard.ps1`：执行策略为 `Restricted` 时 `runyard` 整个不能用；PowerShell 也不等图形界面程序结束，退出码和输出顺序都不对。
- 用路径是否存在判断应用被替换：原地替换后路径照样存在。
