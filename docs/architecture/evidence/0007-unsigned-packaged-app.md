# 0007 的证据：未签名安装包能做到哪一步（K3）

对应决策记录 [0007](../decisions/0007-unsigned-packaged-app.md)。本文自成一体：技术验证的代码已经删除，这里保留问题、数字、判定、采用的做法和没有验证的部分。时间单位毫秒，“中位数 / p95 / 最大”。

## 问题

负责人决定第一版不签名（技术设计 §10）。技术设计 §11.1 留给 K3 的问题：

1. 未签名（macOS 上是 ad-hoc 签名）的包在 macOS arm64 和 Windows x64 上能做到哪一步：能不能打出来、能不能打开、`runyard://` 是否生效、系统通知能否发出。
2. 命令行用应用自带的运行时（Electron 的可执行文件加 `ELECTRON_RUN_AS_NODE=1`）执行是否够快、会不会多出 Dock 图标；不成立的退路是随应用另带一个独立的 Node（约多 100 MB）。
3. 打包工具对 pnpm 目录结构、ad-hoc 签名、打包开关（fuse）是否如预期。
4. 管理进程还活着时覆盖安装、卸载会怎样；macOS 上替换 `.app` 后旧的管理进程怎么办。

## 环境

| 标记 | 机器 | 系统 |
| --- | --- | --- |
| 本机 | 负责人的 Mac，Apple M3 Max 16 核 48 GB | macOS 27.0.1（arm64），Gatekeeper 开着，钥匙串里没有签名证书 |
| CI macOS | GitHub 的 `macos-26`，M1 虚拟机 3 核 7 GB，镜像 20260907.0351.1 | macOS 26.6.2（arm64） |
| CI Windows | GitHub 的 `windows-2025`，4 核 16 GB，镜像 20260925.250.1 | Windows Server 2025 Datacenter 10.0.26100（x64），管理员账户 `runneradmin`，没有可见桌面，Defender 实时防护关，开发者模式开，控制台代码页 437 |

- 都是 Node 24.21.0、pnpm 11.28.0、Electron 44.4.5、electron-builder 26.17.0。打包后的应用里实测 Node 24.21.0、Chromium 152.0.7977.130（三台机器一致）。
- **CI 的 Windows 不是用户的电脑**（服务器版、管理员、无桌面、Defender 关）。凡受这几点影响的结论都标“真机复核”。
- 实验用的链接协议是 `runyard-k3://`（机制相同，不占正式名字），应用名 `RunyardK3`。实验不碰真实的 `~/.runyard`、`~/Runyard`。
- 证据：PR #7（`chore(spikes): K3 未签名安装包的技术验证`，已合并）；CI 第 4 轮 [38189046820](https://github.com/paddychenc75/runyard/actions/runs/38189046820)（两个系统的主要数字）；前三轮 [38185567695](https://github.com/paddychenc75/runyard/actions/runs/38185567695)、[38186604376](https://github.com/paddychenc75/runyard/actions/runs/38186604376)、[38187806605](https://github.com/paddychenc75/runyard/actions/runs/38187806605) 用来修实验脚本。管理进程、客户端、命令行的代码是 K1 的（见 [0005](../decisions/0005-supervisor-singleton-handshake.md)）。

## 测量

### A. 打包

| | 本机 | CI macOS | CI Windows |
| --- | --- | --- | --- |
| 目标 | `dir`、`dmg`、`zip`（arm64） | 同左 | NSIS，一键式，按用户安装（x64） |
| 第一次完整构建 | 37 秒 | 55 到 77 秒（4 轮） | 124 到 168 秒（4 轮） |
| 只打目录的后续构建 | 4 秒 | 5 到 13 秒 | — |
| 解开后的大小 | 305.6 MB | 305.7 MB | 367.5 MB |
| 安装包 | dmg 123 MB，zip 119.2 MB | 同左 | 104.4 MB |

- 大头：Electron Framework 284.5 MB（macOS）；`RunyardK3.exe` 234.6 MB、`locales` 48.3 MB、`dxcompiler.dll` 24.6 MB（Windows）。应用自己的代码加依赖不到 0.2 MB，所以这是正式版安装包大小的下限。
- Windows 上 `--prepackaged` 只重打安装包反而更慢（221 到 295 秒对完整构建 124 到 168 秒），正式构建不用。Windows 静默安装 14 到 36 秒。
- pnpm 目录结构：通过。打包工具认出 pnpm，直接依赖 `chokidar` 和只存在于 `.pnpm` 里的间接依赖 `readdirp` 都进了 asar，三台机器上都能加载。不需要 `node-linker=hoisted`、`shamefully-hoist`。

### B. macOS 签名（本机 1 次，CI 4 轮，结果相同）

| 设置 | 打包工具日志 | 签名 | 深度校验 | 能运行 |
| --- | --- | --- | --- | --- |
| 不动开关，不写 `identity` | skipped | Electron 自带（`adhoc,linker-signed`，标识仍是 `Electron`） | 失败 | 能 |
| 改了开关，不重签 | skipped | 同上，二进制已被改 | 失败 | 本机（macOS 27）被系统杀掉（SIGKILL，生成崩溃报告）；CI（26.6.2）能跑 |
| 改了开关，`resetAdHocDarwinSignature: true`，不写 `identity` | skipped | ad-hoc，标识是我们的 | 通过 | 能 |
| `identity: null` 加上一行 | skipped（明确不签） | ad-hoc | 通过 | 能 |
| `identity: "-"` | signing … identityName=- | ad-hoc | 通过 | 能 |
| x64（arm64 上交叉打包） | skipped | ad-hoc | 通过 | 本机经 Rosetta 能跑；CI 前 3 轮能跑，第 4 轮 60 秒内没跑完（原因没查） |

- 结论：electron-builder 26.17.0 自己不做 ad-hoc 签名。第三行之所以有效，是改开关的库顺手重签了整个包，是副作用，不能依赖。
- 手工执行 `codesign --force --deep --sign -` 后全部通过校验、能运行。`spctl -a` 对所有变体都是 `rejected`（预期）。dmg 挂载后、zip 解出后的应用深度校验通过。

### C. 隔离标记（只在 CI macOS，4 轮里后 3 轮是现在的做法）

| 做法 | 结果 |
| --- | --- |
| 清掉标记（`xattr -dr com.apple.quarantine`）再 `open` | 打开了，窗口出来，管理进程拉起（3/3 轮） |
| 带标记 `open` | `open` 不返回（等了 30 秒），应用没启动；隔离处理程序在 `AppTranslocation/<随机>/d/` 下建了只读映像（3/3） |
| 对话框还挂着时再 `open` | 立刻失败 `error -10673`（3/3）；第 1 轮因此连累后面所有实验，后来改用独立副本 |
| 带标记，直接执行内置命令行 | 正常，`--version` 退出码 0（首次 145 到 777，4/4 轮），还能拉起管理进程（3/3） |
| dmg 带标记，`hdiutil attach` 挂载 | 里面的应用没有标记（命令行挂载的结果，Finder 双击没测） |

看不到屏幕，对话框的文字和按钮没有记录。

### D. 打开应用、管理进程、单实例

| | 本机 | CI macOS | CI Windows |
| --- | --- | --- | --- |
| 窗口显示、标题正确 | 是 | 是 | 是 |
| 管理进程由应用拉起，可执行文件在包内 | 是 | 是 | 是 |
| 开始连接到握手完成 | 76 | 183 到 315（3 轮） | 77 到 86（3 轮） |
| 管理进程空闲内存 | 61.9 MB | 61.2 MB | 71.2 MB |
| 应用正常退出后管理进程、命令行持有的运行、端口都还在 | 是 | 是 | 是 |
| 管理进程登记到 LaunchServices（登记了才可能有 Dock 图标） | 30 次取样全无 | 同左 | 不适用 |

单实例：先强杀管理进程留下残留，再同时启动应用和 4 个命令行。本机 5 轮、CI 每轮 5 轮，每轮只有一个实例号，没有客户端失败。K1 的锁在打包后同样有效。Windows 上应用运行时安装目录里有 5 个 `RunyardK3.exe`（主、GPU、渲染、工具进程加管理进程）。

### E. 用应用自带的运行时跑命令行

- Dock 图标、焦点：命令行活 3 秒，每 100 毫秒看一次。本机 1 次、CI 4 轮，每次 30 个取样全是“没登记”，子进程 0 个，最前面的应用没变。
- 启动耗时，每种写法 40 次（Windows 30 次），先热身一次：

| macOS | 本机 | CI macOS |
| --- | --- | --- |
| 系统 Node 24，`--version` | 25.1 / 26.3 / 27.4 | 42.3 / 56.4 / 188.7 |
| 应用运行时直接执行 | 51.4 / 52.6 / 55.2 | 81.7 / 108.4 / 127.3 |
| 应用运行时经 `bin/runyard` | 54.4 / 55.8 / 58.6 | 91.2 / 120.0 / 126.9 |
| 经 PATH 符号链接、最小环境 | 57.0 / 60.7 / 62.7 | 97.3 / 121.8 / 127.3 |
| 应用运行时经 `bin/runyard`，`status` | 58.8 / 61.3 / 61.7 | 94.3 / 117.9 / 135.1 |
| 对照 `/bin/sh -c :` | 3.9 / 4.2 / 4.4 | 5.9 / 10.5 / 11.7 |

| Windows（CI 第 4 轮） | 中位数 / p95 / 最大 |
| --- | --- |
| 系统 Node 24，`--version` | 55.2 / 61.4 / 63.1 |
| 应用运行时直接执行 | 40.5 / 46.5 / 48.3 |
| 应用运行时经 `runyard.cmd`，`--version` | 63.5 / 70.2 / 74.7（第 2、3 轮中位数 72.7、80.8，p95 137.9、103.3） |
| 应用运行时经 `runyard.cmd`，`status` | 73.2 / 88.1 / 133.9 |
| 对照 `cmd /c exit` | 16.1 / 18.1 / 21.6 |

- CI macOS 每轮快慢不同：4 轮里经 `bin/runyard` 的 `--version` 中位数 64 到 91、p95 78 到 120。应用运行时比系统 Node 在 macOS 上慢约 26 到 40；shell 脚本层约 3，`cmd` 层约 20。
- 装好后的第一次执行单独看：本机 2076，CI macOS 95 到 543（系统第一次执行新的大二进制要检查它），之后就是上表。Windows CI 的 Defender 实时防护是关的，用户电脑会慢些（真机复核）。
- macOS PATH 符号链接：临时 bin 目录里的符号链接（含相对链接）指向 `Contents/Resources/bin/runyard`，用 `env -i` 只给 `PATH`、`HOME`，从 `sh`、`zsh -f`、`bash --noprofile --norc` 调用，都找到、版本正确；带空格、中文、引号的参数原样到达，退出码 7、9 原样传回；安装位置故意带空格和中文。本机 1 次、CI 4 轮全部通过。
- Windows 三种终端（CI，第 2、3、4 轮相同；PATH 由系统 PATH 加注册表里的用户 PATH 拼成；参数 `"hello world" "中文 参数" "a&b" "50%" "x^y" ""`）：

| 从哪里 | 找到 | 参数 | 退出码 7 |
| --- | --- | --- | --- |
| cmd | `bin\runyard.cmd` | 6 个全对 | 传回 |
| Windows PowerShell 5.1、PowerShell 7 | `bin\runyard.cmd` | 只到 `a` 为止，后面丢了，报 `'b' is not recognized`（去掉 `a&b` 后 `x^y` 变成 `xy`） | 传回 |
| Git Bash | 没有扩展名的 `bin/runyard` | 6 个全对 | 传回 |
| Git Bash，目录里只有 `.cmd` | 找不到，退出码 127 | — | — |

原因：PowerShell 只给带空格的参数加引号，`a&b` 原样交给 `.cmd` 后被 cmd 当命令分隔符；所有 `.cmd` 垫片都有这个通病。对照 `runyard.ps1`（npm 垫片带的那种）：PowerShell 优先用它，参数全对；但执行策略 `Restricted`（Windows 客户端默认）时整个 `runyard` 报 “running scripts is disabled”，连 `.cmd` 都轮不到；而 Electron 的可执行文件是图形界面程序（PE 子系统 2），PowerShell 5.1 不等它结束，退出码拿到 0 而非 7、输出顺序错乱。批处理里 cmd 会等，没有这个问题。

控制台黑窗口：CI 看不到。机制：应用可执行文件是图形界面程序、自己不开控制台，从 cmd、PowerShell、Git Bash 经 `.cmd` 或脚本调用时沿用已有控制台。真机复核。

### F. 链接协议

macOS（本机 1 次，CI 4 轮相同）：

| 情况 | 结果 |
| --- | --- |
| 应用在临时目录（`/private/var/folders/…/T/`），已 `open` 过 | 系统登记了（声明了协议）但标 `in-temp-dir`，不当作处理程序：`open 'runyard-k3://…'` 报 `kLSApplicationNotFoundErr` |
| 同一份放到普通目录，打开一次 | 成为处理程序 |
| 应用在运行 | 送到运行中进程的 `open-url` 事件，地址完整 |
| 应用没在运行 | 应用被启动，`open-url` 在 `ready` 之前就到；地址不在命令行参数里 |
| `lsregister -u` 并删除后 | 处理程序查不到 |

Windows（CI，第 2、3、4 轮）：注册表项是安装器的钩子（`customInstall` 写 `HKCU\Software\Classes\runyard-k3`）写的，electron-builder 的 NSIS 目标不登记（读源码：没有处理 `protocols`）。应用没在运行：被启动，地址在命令行参数里。应用在运行：系统再启动一个实例，它拿不到单实例锁，把命令行交给第一个实例后退出，第一个实例的 `second-instance` 事件拿到完整地址（含 `&`）。

### G. 系统通知（CI macOS，第 2、3、4 轮）

`Notification.isSupported()` 为 `true`，随后 `failed` 事件，错误 `Notifications are not allowed for this application`；系统日志 `usernoted` 记 `Failed to find or validate client`，`didGrant: 0 hasError: 1`。ad-hoc 签名不算数，设计本来不依赖通知。

### H. 管理进程活着时替换 `.app`（macOS，本机 13 次，CI 4 轮）

两份构建：v1（0.3.0，协议版本 1）、v2（0.3.1，协议版本 2）。

| 场景 | 结果 |
| --- | --- |
| A. v1 换成 v2（像 Finder：旧的挪走，新的放进来，旧的删掉），替换时有一个运行 | 旧管理进程和运行都活着；发现文件里的路径仍然存在（已是新文件）；新版命令行连得上并能起运行（带 `SUPERVISOR_OLDER_COMPAT`）；停掉运行后再启动应用，旧的被请走，新的起来，协议版本 2 |
| B. 同一协议版本的另一份构建，管理进程空闲 | 应用启动后沿用旧管理进程：路径检查没触发（路径存在），握手表也认为“版本相同，直接用”。**这是缺口** |
| C. 不挪走旧的，`ditto` 直接覆盖 | 旧管理进程没死；覆盖后签名校验通过；新版应用启动后把它换掉 |
| D. 应用被挪到别处 | 路径不存在。空闲时旧的被请走，新的从新位置起来；有运行时保留旧的，不动运行 |

一处没查清：场景 A 里“把旧包彻底删掉”之后，本机 13 次里有 2 次旧管理进程在半秒内不见了；第一次当时那个运行正卡在系统授权框上，第二次没有。加了取证后再跑本机 9 次、CI 4 轮没有再出现，原因未知。

### I. Windows 安装、PATH、卸载（CI 第 4 轮）

- 静默安装（`setup.exe /S`）装在 `%LOCALAPPDATA%\Programs\<package.json 的 name>`（目录名取 `name`，不是产品名），按用户安装不需要管理员。卸载条目 `RunyardK3 0.3.0`，发布者取自 `author`，开始菜单和桌面各一个快捷方式。
- 安装器不动 PATH。应用来加（模拟“安装命令行工具”）：保持 `REG_EXPAND_SZ`，原值一个字符不变，再点一次不重复。
- 卸载后和安装前逐项比较：用户 PATH 逐字相同（含末尾分号）、类型相同；链接协议项、卸载条目、`HKCU\Software\<GUID>`、安装目录、快捷方式都没了；`%APPDATA%`、`%LOCALAPPDATA%` 下无新增带 runyard 的目录。
- 两处踩到后改对：第 2 轮 PATH 少了末尾分号（当时拆开再拼回，现在只增删自己那一段）；第 1 轮卸载后留下 `%LOCALAPPDATA%\<包名>-updater`（模板的卸载不删，现在由钩子删）。

### J. Windows 管理进程活着时覆盖安装、卸载（第 4 轮；“只剩管理进程”的行第 2、3 轮相同）

加钩子后：

| 场景 | 安装器 | 管理进程 | 运行 | 结果 |
| --- | --- | --- | --- | --- |
| 应用已退出，只剩管理进程和运行；0.3.0 到 0.3.1 | 退出码 0，14 秒 | 自己退出（`shutdown-begin: requested:install`），74 | 被停掉，端口释放 | 0.3.1 |
| 应用窗口还开着；0.3.1 盖 0.3.1 | 0，16 秒 | 71 | 被停掉 | 能正常启动，新管理进程协议版本 2 |
| 卸载 | 成功，8 秒，安装目录没了 | 85 | 被停掉 | — |

钩子报告 `runs: 1`（安装器可据此事先告诉用户会停几个运行）。覆盖安装时 PATH 和链接协议保留；运行是被停掉的，不保留。

对照一：打包工具自带检查，不加钩子。只剩管理进程时覆盖安装：退出码 0，**管理进程、运行、端口、发现文件都还在**，旧文件被挪到 `%TEMP%\ns*.tmp\old-install`；应用窗口也开着时覆盖安装：应用和管理进程被直接结束，管理进程来不及记日志，发现文件留下，运行也没了（第 3、4 轮）；只剩管理进程时卸载：退出码 0，**管理进程和运行活着，安装目录里剩一个删不掉的 `RunyardK3.exe`**。
原因：模板用 `(Get-CimInstance … | ? {…}).Count -gt 0` 判断；包上 `@( )` 后数出来是 1（只剩管理进程）和 5（应用也开着），与安装器行为“1 个当没有、5 个全杀”吻合。Windows PowerShell 5.1 里单个对象没有可靠的 `.Count`，是打包工具缺陷，正好打在“只剩一个没有窗口的管理进程”上。
对照二：把检查整个关掉：覆盖安装退出码 0，管理进程和运行都活着，`%TEMP%` 留下 2 个 `old-install`；卸载同对照一。

### K. 未签名的 Windows 安装包（CI）

`Get-AuthenticodeSignature`：安装包和装好的 `RunyardK3.exe` 都是 `NotSigned`。Defender 扫描（病毒库 1.459.676.0）都是 `found no threats`。给安装包加 `Zone.Identifier`（`ZoneId=3`）后用 `CreateProcess` 静默安装成功，退出码 0，装出来的文件不带标记；同一文件经 `ShellExecute`（资源管理器双击的路）没有运行，报 `The operation was canceled by the user`（无交互桌面，确认框等于取消）。说明拦截发生在“经资源管理器打开”这一层，不在进程创建层。真正的 SmartScreen 与智能应用控制是 K14（真机）。

### L. 打包开关

主构建：`runAsNode` 开；`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments`、`enableCookieEncryption`、`loadBrowserProcessSpecificV8Snapshot`、`grantFileProtocolExtraPrivileges` 关；`enableEmbeddedAsarIntegrityValidation`、`onlyLoadAppFromAsar` 开。两个系统上应用都正常启动。

- 关掉 `runAsNode`（CI 两系统）：`ELECTRON_RUN_AS_NODE=1 <可执行文件> cli.mjs --version` 没有打印版本号，起来的是一个完整应用，脚本路径成了普通参数；应用去拉管理进程时拉起的又是应用实例（拿不到单实例锁立刻退出），15 秒后报 `SUPERVISOR_UNAVAILABLE`。管理进程和内置命令行都没了。
- 关掉 `grantFileProtocolExtraPrivileges`：`loadFile()` 读 asar 里的页面失败 `ERR_FILE_NOT_FOUND`（本机、CI）；只打开这一个开关同样代码就能加载。主构建走自己注册的 `app://runyard/`，正常。
- `enableEmbeddedAsarIntegrityValidation` 开着两系统都能启动；`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments` 关着不影响当作 Node 运行的管理进程和命令行。

## 对照通过标准

| 通过标准（技术设计 §11.1 的 K3 行） | 判定 |
| --- | --- |
| 清除隔离标记后能打开 | 通过（CI macOS 26.6.2，3/3 轮）；本机未验证 |
| 链接生效 | macOS 通过（应用不在临时目录时）；Windows 命令行部分通过，真实浏览器是真机项目 |
| 系统通知能否发出 | 发不出，与预期一致，不影响设计 |
| 命令行不出 Dock 图标 | 通过（本机和 CI 每次 30 个取样） |
| 命令行启动不慢于 150 毫秒 | 通过：中位数 macOS 54（本机）、64 到 91（CI），Windows 64 到 81（CI）；p95 在 CI 上到过 120（macOS）、138（Windows），没有超过 150 |
| 打包工具对 pnpm 目录结构如预期 | 通过 |
| 打包工具对 ad-hoc 签名如预期 | 不如预期：它不自动做；写明 `identity: "-"` 后通过 |
| 各打包开关如预期 | 通过，并查实两条限制（`runAsNode`、`grantFileProtocolExtraPrivileges`） |
| 两种架构的签名校验通过 | 通过（arm64、x64 的深度校验）；x64 没有在 Intel 的 Mac 上运行过 |
| 管理进程活着时覆盖安装和卸载都成功 | 通过（加钩子之后）；不加钩子是“报成功但状态是坏的” |
| 卸载后用户 PATH 里没有残留 | 通过，与安装前逐字相同 |
| macOS 上替换应用后旧管理进程被换掉 | 部分通过：协议版本变了或应用被挪走时通过；同一协议版本原地替换时不通过 |

## 决定与采用的做法

### electron-builder 配置要点

```
appId, productName, files: [app/**, package.json], asar: true
extraResources: 管理进程与命令行作为普通 JS 放在 asar 外（resources/runtime/）
electronFuses:
  runAsNode: true                         # 必须开
  enableNodeOptionsEnvironmentVariable: false
  enableNodeCliInspectArguments: false    # 正式构建；端到端测试构建另议
  enableEmbeddedAsarIntegrityValidation: true
  onlyLoadAppFromAsar: true
  grantFileProtocolExtraPrivileges: false # 界面必须走 app://runyard/
  enableCookieEncryption: false
  loadBrowserProcessSpecificV8Snapshot: false
  resetAdHocDarwinSignature: true
mac: { identity: "-", hardenedRuntime: false, notarize: false }  # 明确 ad-hoc
nsis: { oneClick: true, perMachine: false, deleteAppDataOnUninstall: false, include: <钩子文件> }
publish: null
构建时环境变量: CSC_IDENTITY_AUTO_DISCOVERY=false（不许去钥匙串找证书）
pnpm: allowBuilds 里写 electron-winstaller: false（间接依赖，安装脚本只是挑 7z，用不到；不写则 strictDepBuilds 使安装失败）
打包后: codesign --verify --deep --strict，不过则构建失败
```

### NSIS 钩子（安装器和卸载器开始时都展开）

```
macro customCheckAppRunning:
  if 文件存在 $INSTDIR\bin\runyard.cmd:
    执行 cmd /D /C ""$INSTDIR\bin\runyard.cmd" installer-stop --reason install"
  # 然后展开打包工具原来的检查，处理应用窗口本身
  展开 IS_POWERSHELL_AVAILABLE; 展开 _CHECK_APP_RUNNING

installer-stop:
  读发现文件 -> 连管理进程 -> 发 supervisor.shutdown { ifIdle: false, reason: 'install' }
  最多等 5 秒
  还活着: 核对进程身份（可执行文件路径、启动时间）后再结束   # 这一支实验中没走到过

macro customInstall:    登记链接协议（HKCU\Software\Classes\<协议>）
macro customUnInstall:  if 不是覆盖安装(isUpdated):
                          调用内置命令行 path-remove（只删自己那一段）
                          删链接协议项
                          删 %LOCALAPPDATA%\<包名>-updater
```

### Windows 用户 PATH 的改法（应用里“安装命令行工具”）

```
读 HKCU\Environment\Path 的原始值和类型（保持 REG_EXPAND_SZ）
用字符串操作只追加（或只移除）自己那一段，不拆分重拼（否则丢末尾分号）
已存在则不重复；写回后广播设置变更；不用 setx
```

### 内置命令行入口

- macOS：`Contents/Resources/bin/runyard`（shell 脚本）。PATH 上的符号链接指向它；脚本顺着链接找到应用，再用应用的可执行文件加 `ELECTRON_RUN_AS_NODE=1` 执行命令行。
- Windows：安装目录 `bin\runyard.cmd`（只含 ASCII，注释也不许有中文：UTF-8 中文在双字节代码页如 936 下可能吞掉换行，这一点按已知机制规避、没有实测）和一个没有扩展名的 `runyard`（shell 脚本，给 Git Bash）。不放 `runyard.ps1`。
- 已知限制：PowerShell 传含 `&`、`^`、`|`、`<`、`>` 且不含空格的参数会被 cmd 改写，已知限制；要彻底解决得带一个控制台程序做入口（与 K2 提到的 Windows 辅助可执行文件同时决定，见 [0006](../decisions/0006-stop-process-tree.md)）。

### 判断“管理进程是不是旧的”

```
发现文件新增 buildId = 版本号 + 构建时生成的随机串
客户端/应用启动时:
  协议版本不同        -> 按握手表（旧：无运行则换新，有运行则兼容或 SUPERVISOR_OUTDATED）
  协议版本相同:
    buildId 相同      -> 直接用
    buildId 不同      -> 无运行: 请旧的退出（ifIdle:true, reason:'upgrade'）再起自己的
                         有运行: 沿用并在设置页提示
  发现文件里的可执行文件路径不存在 -> buildId 不同的一种特例，同样处理
```

## 被否的做法与原因

- 依赖打包工具自动 ad-hoc 签名：实测不发生；依赖“改开关顺手重签”：是副作用。
- 只靠打包工具自带的“应用还在运行”检查：只剩一个进程时找不到；找到时也是直接结束，来不及停运行。
- `runyard.ps1`：见 E 节（执行策略、不等图形程序）。
- 用路径是否存在判断应用被替换：原地替换后路径照样存在（场景 B）。
- 另带独立的 Node：没有需要它的理由，还要多约 100 MB。

## 接受的风险与限制

- 未签名的 macOS 应用发不出系统通知；第一版不用系统通知。
- PowerShell 经 `.cmd` 传参的改写（见上）。
- 应用放在临时目录或带隔离标记直接打开（被系统换到随机只读路径下运行）时 `runyard://` 不会交给它；下载页写明“先拖进‘应用程序’再打开”。命令行不受隔离标记影响。
- 由应用拉起的管理进程启动的运行，在 macOS 看来是 Runyard 在访问文件：项目在桌面、文稿、下载里时用户会被问一次授权。实验中管理进程的子进程在本机一次卡住不动，推断是授权框（看不到屏幕，系统日志无记录）。ad-hoc 签名的应用每次更新后身份会变，授权很可能要重新给（未验证）。
- 进程号会被复用：CI 第 3 轮新管理进程拿到与前一个实验相同的进程号，脚本按“进程号加启动时间”核对后拒绝结束，留下一个进程；这印证了“结束进程前必须核对身份”（另见 [0006](../decisions/0006-stop-process-tree.md)）。
- 依赖：electron-builder 的间接依赖 `http-cache-semantics` 4.2.0 有高危公告 GHSA-ch52-4w7c-c8xp（路径 `electron-builder > app-builder-lib > @electron/get > got > cacheable-request`，只在构建时下载用），修复版 4.3.0 于 2026-10-04 发布、2026-10-18 满 14 天；在那之前带 electron-builder 的锁文件过不了 `pnpm audit`，年龄规则不许绕过。另有中危 GHSA-hp3w-g68c-fv3c（`sprintf-js`，无修复版）。
- 构建时下载：Electron 44.4.5 的 zip（GitHub 发布页，按 `SHASUMS256.txt` 校验）；`7zip@1.0.0`、`dmg-builder@1.2.5`（自带 Python 3.14）、`nsis-3.0.4.1`、`nsis-resources-3.4.1`（electron-builder-binaries 发布页，源码里带 SHA-256）。没有下载 `winCodeSign` 和 Wine。地址与校验和来自打包工具源码，没有抓包核对。

## 没有验证的

- macOS：Gatekeeper 对话框的内容；系统设置里“仍要打开”这条路；Finder 双击挂载 dmg 后隔离标记的传递；x64 的包在 Intel Mac 上运行；负责人的 Mac 上“清除隔离标记后能打开”（只在 CI 做了）；更新后隐私授权是否要重给；场景 A 里 2 次旧管理进程消失的原因。
- Windows：arm64 的包没有打；钩子里“5 秒后强行结束”那一支；管理进程卡死或连不上时钩子的表现；非静默安装的安装器界面（钩子拿得到运行数，界面没做）。
- 自动更新、Homebrew、winget、Scoop：不在范围内。

## 需要在负责人的 Windows 真机上复核

1. K14 全部：Edge 下载后双击安装包的 SmartScreen 画面；开着智能应用控制时的表现；杀毒软件反应。
2. `runyard://`：在 Edge、Chrome 里点链接，浏览器的确认框，应用在运行和没在运行两种情况。
3. 普通（非管理员）用户下：按用户安装、应用改 PATH、钩子停管理进程、卸载（CI 是管理员）。
4. Defender 实时防护开着时命令行的启动耗时和第一次执行的耗时。
5. 黑窗口：从 cmd、PowerShell、Windows Terminal、Git Bash、资源管理器分别执行 `runyard`，有没有窗口闪一下；交互式控制台里（非管道）输出是否正常。
6. 中文版 Windows（代码页 936）、用户名带中文或空格时：安装目录、`runyard.cmd`、PATH。
7. 应用改完 PATH 后不注销，新开的终端里能不能直接用 `runyard`。
8. 非静默安装：管理进程活着时双击安装包，看到的提示和结果。

## 需要负责人在自己的 Mac 上看一次的

- 清除隔离标记后能打开（本机没做隔离实验，只做了“没有标记时能打开”）。
- 双击带隔离标记的应用时 Gatekeeper 对话框的文字与按钮，以及“仍要打开”这条路。
- 把项目放在桌面时，是否弹出“Runyard 想访问桌面文件夹”的授权框；更新应用后是否要重新授权。

## 踩到的坑

- 带隔离标记的应用被 `open` 之后，在对话框被处理前，同一应用再 `open` 一律失败（-10673）。
- Windows PowerShell 5.1 里单个对象没有可靠的 `.Count`（见 J 节）。
- `.cmd` 文件里不能有中文注释（见上）。
- 打包工具的下载缓存位置用环境变量 `ELECTRON_BUILDER_CACHE` 指定，免得散落在用户目录里。
