# NNNN. 未签名安装包的打包方式、内置命令行的入口和安装器钩子（K3 的结论）

状态：提议中

日期：2026-10-12

来源：PRD #prd-release-plan；技术设计 §2.4、§5.4、§6.5、§8.1、§8.2、§10、§11.1 的 K3；技术验证 `spikes/k3/README.md`

## 背景

负责人决定第一版不签名。技术设计留给 K3 的问题是：未签名的包在 macOS arm64 和 Windows x64 上能做到哪一步；内置命令行用应用自带的运行时执行是否够快、会不会多出 Dock 图标；管理进程还活着时安装、升级、卸载会怎样。K3 在负责人的 Mac（macOS 27.0.1）和 CI 的 macOS 26.6.2、Windows Server 2025 上实测了这些，数字见 `spikes/k3/README.md`。

## 决定

管理进程和内置命令行继续用应用自带的运行时执行（`ELECTRON_RUN_AS_NODE=1`），不随应用另带独立的 Node。在此基础上定七条：

1. macOS 签名。electron-builder 26.17.0 不会自动做 ad-hoc 签名。配置里写 `mac.identity: "-"`，打包开关里开 `resetAdHocDarwinSignature`，打包后用 `codesign --verify --deep --strict` 校验，不过就让构建失败。
2. 打包开关。`runAsNode` 保持开；`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments`（正式构建）、`grantFileProtocolExtraPrivileges` 关；`onlyLoadAppFromAsar`、`enableEmbeddedAsarIntegrityValidation` 开。界面只从 `app://runyard/` 加载，这是必须的：关掉 `grantFileProtocolExtraPrivileges` 后 `file://` 读不到 asar 里的文件。
3. 内置命令行的入口。macOS：`Contents/Resources/bin/runyard`，一个 shell 脚本，PATH 上的符号链接指向它。Windows：安装目录的 `bin\` 里放 `runyard.cmd`（只含 ASCII）和一个没有扩展名的 shell 脚本 `runyard`（Git Bash 不认 `.cmd`）。不放 `.ps1`。
4. Windows 的 PATH。由应用（设置里的“安装命令行工具”）直接改注册表里用户的 `Path`：保持原来的值类型，只增删自己那一段，写完广播设置变更；不用 `setx`。安装器不动 PATH。
5. Windows 安装器的钩子。定义 NSIS 的 `customCheckAppRunning`：先调用 `bin\runyard.cmd installer-stop`（发 `supervisor.shutdown { ifIdle: false, reason: 'install' }`，最多等 5 秒，还活着就核对进程身份后结束），再展开打包工具原来的检查。`customInstall` 登记链接协议；`customUnInstall` 在不是覆盖安装时删 PATH 里的那一段、链接协议、更新缓存目录。
6. 判断“管理进程是不是旧的”，除了协议版本，再加一个构建标识（版本号加构建时生成的随机串），写进发现文件。构建标识不同：没有运行时换新，有运行时沿用并提示。“发现文件里记的路径不存在”只是其中一种情况。
7. 下载页和说明文件写明：macOS 上先把应用拖进“应用程序”文件夹再打开。

## 后果

- 命令行启动（`--version`，中位数）：macOS 54 到 91 毫秒，Windows 64 到 81 毫秒；没有 Dock 图标，不抢焦点。装好后的第一次执行在 macOS 上要 0.1 到 2.1 秒。
- 不加第 5 条的钩子，覆盖安装和卸载都会“报成功但状态是坏的”：旧的管理进程和运行还活着，卸载后留下删不掉的可执行文件。所以钩子是 MW 的必做项，不是优化。加钩子后，安装和卸载时所有运行都会被停掉，安装器要事先告诉用户会停几个（钩子拿得到这个数）。
- 在 PowerShell 里经 `runyard.cmd` 传参时，不带空格又含 `&`、`^` 等字符的参数会被 cmd 改掉。这是已知限制，写进命令行的说明；要彻底解决得带一个控制台程序做入口，MW 时和 `runyard-job.exe` 一起决定。
- 未签名的 macOS 应用发不出系统通知（实测），第一版不用系统通知的决定不变。
- macOS 上应用在临时目录或被系统换到随机路径下运行时，`runyard://` 不会交给它。
- 由应用拉起的管理进程启动的运行，在 macOS 看来是 Runyard 在访问文件；项目放在桌面、文稿、下载文件夹里时用户会被问一次授权。
- Windows 的安装目录名取自桌面应用那个包的 `package.json` 的 `name`。
- `pnpm-workspace.yaml` 的 `allowBuilds` 要加 `electron-winstaller: false`。electron-builder 的间接依赖 `http-cache-semantics` 4.2.0 有高危公告，修复版 2026-10-18 才满 14 天；在那之前带 electron-builder 的锁文件过不了审计。
- 没有验证、留给真机和 K14 的：Gatekeeper 和 SmartScreen 的实际画面；真实浏览器里点链接；普通 Windows 用户；Defender 实时防护开着时的耗时；黑窗口。

## 被否的方案

- 随应用另带一个独立的 Node：没有需要它的理由，还要多约 100 MB。
- 依赖打包工具自己签名，或依赖改打包开关时顺带的重签：前者不发生，后者是副作用。
- 只靠打包工具自带的“应用还在运行”检查：只剩一个进程时它找不到；找到时也是直接结束，管理进程来不及停运行。
- Windows 上加 `runyard.ps1`：执行策略为 `Restricted` 时 `runyard` 整个不能用；PowerShell 也不等图形界面程序结束，退出码和输出顺序都不对。
- 用路径是否存在来判断应用被替换：原地替换后路径照样存在。
