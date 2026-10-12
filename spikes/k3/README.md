# K3：未签名的安装包能做到哪一步

技术设计 §11.1 的 K3（M0a 部分）。一次性实验，M0a 结束时删除。

## 结论（先说）

**设计成立，不需要启用“随应用另带一个独立的 Node”的退路。** 未签名（macOS 上是 ad-hoc 签名）的包在 macOS arm64 和 Windows x64 上都能打出来、能打开；管理进程由打包后的应用用自带的运行时拉起，活过应用；包里的命令行用同一个运行时执行，没有 Dock 图标，启动中位数 54 到 91 毫秒（上限 150）。

但有六处设计原文照做会出问题，要改：

1. **打包工具不会替我们做 ad-hoc 签名。** electron-builder 26.17.0 在没有证书时只打印“skipped”。改过打包开关（fuse）又没重签的包，在 macOS 27 上一启动就被系统杀掉。要在配置里写明 `mac.identity: "-"`，并保留“打包后校验签名”这一步。
2. **Windows 上不加钩子，安装器不会失败，而是悄悄装成一个坏状态。** 设计原文预计“安装器会失败或要求重启”。实测：覆盖安装和卸载都返回成功，但旧的管理进程和它的运行还活着，卸载后安装目录里留着删不掉的 `RunyardK3.exe`。打包工具自带的“应用还在运行”检查在只剩一个进程时找不到它（PowerShell 5.1 的一个计数问题，实测）。加上本文的钩子后三种情况都干净。
3. **Windows 的 `bin` 里只放 `runyard.cmd` 不够。** Git Bash 里输入 `runyard` 找不到它（退出码 127），要另放一个没有扩展名的 shell 脚本。PowerShell 经 `.cmd` 传参时，不带空格的 `a&b` 会被截断、`x^y` 会丢掉 `^`。
4. **“发现文件里记的路径不存在就换新”只管得到应用被挪走的情况。** 在原位置替换 `.app`（最常见的更新方式）后路径照样存在；协议版本没变时旧的管理进程会一直留着，跑的是已经删掉的旧文件。
5. **macOS 上应用放在临时目录里时，系统不把它当作链接的处理程序。** 放到普通目录后 `runyard://` 两种情况都送达。带隔离标记直接打开的应用会被系统换到一个随机的只读路径下运行，同样属于这一类，所以要告诉用户先拖进“应用程序”。
6. **打包开关全开时，界面不能用 `file://` 从 asar 里加载。** 设计本来就定了走 `app://runyard/`，这里只是证实了它是必须的，不是可选的。

**没有覆盖的**：Gatekeeper 对话框长什么样、系统设置里“仍要打开”这条路（只能看到“被拦住了”，看不到屏幕）；SmartScreen 和智能应用控制（K14，真机）；真实浏览器里点 `runyard://`（真机）；Windows 上黑窗口的肉眼确认；普通（非管理员）Windows 用户。见“未验证”和“需要在 Windows 真机上复核”。

## 怎么复现

```sh
cd spikes/k3 && pnpm install && node experiments/mac.mjs
```

需要 Node 24、macOS、Apple 芯片。约 6 分钟，结果写进 `results/darwin-arm64-local.json` 并打印每项判定。它会在后台打开几次测试应用的窗口（不抢焦点）。带隔离标记打开、发系统通知、关掉 `runAsNode` 这三项只在加 `--ci` 时做，本机不要加：它们会在屏幕上弹系统对话框。

Windows 部分（`experiments/win.mjs`）会真的安装、卸载、改当前用户的 PATH 和注册表，脚本自己拒绝在没有 `CI` 环境变量的机器上运行。两个系统的 CI：`.github/workflows/spike-k3.yml`，推送到 `spike/k3-*` 分支时运行。

没有提交锁文件，原因见“安装过的依赖和查过的内容”。

## 环境

| 标记 | 机器 | 系统 |
| --- | --- | --- |
| 本机 | 负责人的 Mac，Apple M3 Max 16 核，48 GB | macOS 27.0.1（arm64），Gatekeeper 开着，钥匙串里没有签名证书 |
| CI macOS | GitHub 的 `macos-26`，M1 虚拟机 3 核，7 GB，镜像 `20260907.0351.1` | macOS 26.6.2（arm64），Gatekeeper 开着 |
| CI Windows | GitHub 的 `windows-2025`，4 核，16 GB，镜像 `20260925.250.1` | Windows Server 2025 Datacenter 10.0.26100（x64） |

- 都是 Node 24.21.0、pnpm 11.28.0、Electron 44.4.5、electron-builder 26.17.0。
- 本机的数字来自 `results/darwin-arm64-local.json`；CI 的来自第 4 轮运行 [38189046820](https://github.com/paddychenc75/runyard/actions/runs/38189046820)，副本在 `results/ci-run-38189046820/`。一共推了 4 轮，前 3 轮（[38185567695](https://github.com/paddychenc75/runyard/actions/runs/38185567695)、[38186604376](https://github.com/paddychenc75/runyard/actions/runs/38186604376)、[38187806605](https://github.com/paddychenc75/runyard/actions/runs/38187806605)）用来修实验脚本，其中的发现写在下面对应的位置。
- 时间单位是毫秒，写成“中位数 / p95 / 最大”。
- **CI 的 Windows 不是用户的电脑**：服务器版、管理员账户（`runneradmin`）、没有可见的桌面、Defender 的实时防护是关的、开着开发者模式、控制台代码页 437。受这几点影响的地方下面都标了“真机复核”。
- 打包后的应用里实测：Node **24.21.0**，Chromium **152.0.7977.130**（三台机器一致）。§8.1 那行的疑问可以结掉。
- 实验用的链接协议是 `runyard-k3://`，不是 `runyard://`：机制相同，不在负责人的电脑上占正式的名字。应用名是 `RunyardK3`，包标识 `dev.runyard.spike.k3`。

## 实验的搭法

- `app/`：最小的 Electron 应用，一个窗口一行字，打进 asar。启动时用自己的可执行文件加 `ELECTRON_RUN_AS_NODE=1` 拉起管理进程并保持连接。
- 管理进程、客户端、命令行**原样用 K1 的代码**（`../k1/supervisor.mjs`、`cli.mjs`、`lib/`），打包时作为普通 JS 文件复制到 `resources/runtime/`，在 asar 外面。
- `runtime/runyard-cli.mjs`：内置命令行的入口，在 K1 的命令行前面加了几条不连管理进程的命令（`--version` 等）和安装器要用的两条（`installer-stop`、`path-remove`）。
- `bin/mac/runyard`（shell 脚本，放在 `Contents/Resources/bin/`）；`bin/win/runyard.cmd` 和 `bin/win/runyard`（放在安装目录的 `bin\`）。
- `build/installer.nsh`：NSIS 钩子。
- 实验绝不使用真实的 `~/.runyard`：数据目录在一个临时文件夹里，打包后的应用和命令行靠一个“指针文件”找到它。没有指针就拒绝运行。
- 每台机器的 `~/.runyard`、`~/Runyard` 在实验前后都不存在。

## 做了哪些实验

### A. 打包

| | 本机 | CI macOS | CI Windows |
| --- | --- | --- | --- |
| 目标 | `dir`、`dmg`、`zip`（arm64） | 同左 | NSIS，一键式，按用户安装（x64） |
| 第一次完整构建 | 37 秒 | 55 到 77 秒（4 轮） | 124 到 168 秒（4 轮） |
| 只打目录的后续构建 | 4 秒 | 5 到 13 秒 | — |
| 解开后的大小 | 305.6 MB | 305.7 MB | 367.5 MB |
| 安装包大小 | dmg 123 MB，zip 119.2 MB | 同左 | 104.4 MB |
| 大头 | Electron Framework 284.5 MB | 同左 | `RunyardK3.exe` 234.6 MB，`locales` 48.3 MB，`dxcompiler.dll` 24.6 MB |

应用自己的代码加依赖不到 0.2 MB，所以这就是正式版安装包大小的下限。Windows 上用 `--prepackaged` 只重新打安装包反而更慢（221 到 295 秒，对比完整构建 124 到 168 秒），正式构建不要用这个参数。Windows 上静默安装 14 到 36 秒。

**pnpm 目录结构：通过。** 打包工具认出了 pnpm（日志 `pm=pnpm`），把直接依赖 `chokidar` 和只存在于 `.pnpm` 里的间接依赖 `readdirp` 都收进了 asar；应用启动后两者都能加载（三台机器）。不需要 `node-linker=hoisted`，也不需要 `shamefully-hoist`。

### B. macOS 签名

每种设置各打一份（本机 1 次，CI 4 轮结果相同），看三样：`codesign -dv` 的签名类型、`codesign --verify --deep --strict` 的结果、当作 Node 直接执行能不能跑。

| 设置 | 打包工具的日志 | 签名 | 深度校验 | 能运行 |
| --- | --- | --- | --- | --- |
| 不动打包开关，不写 `identity` | skipped | Electron 自带的（`adhoc,linker-signed`，标识还是 `Electron`） | **失败** | 能 |
| 改了打包开关，不重签 | skipped | 同上，但二进制已被改动 | **失败** | **本机（macOS 27）被系统杀掉（SIGKILL，并生成一份崩溃报告）**；CI（macOS 26.6.2）能跑 |
| 改了打包开关，`resetAdHocDarwinSignature: true`，不写 `identity`（主构建） | skipped | ad-hoc，标识是我们的 | 通过 | 能 |
| `identity: null` 加上面这项 | skipped（明确不签） | ad-hoc | 通过 | 能 |
| `identity: "-"` | signing … identityName=- | ad-hoc | 通过 | 能 |
| `identity: "-"`，不动打包开关 | 同上 | ad-hoc | 通过 | 能 |
| x64（在 arm64 上交叉打包） | skipped | ad-hoc | 通过 | 本机经 Rosetta 能跑；CI 前 3 轮能跑，第 4 轮 60 秒内没跑完（原因没查） |

- 结论：**electron-builder 26.17.0 自己不做 ad-hoc 签名**。第 3 行之所以有效，是改打包开关的那个库顺手把整个包重签了一遍，这是副作用，不该依赖。
- 每一份再手工执行设计 §8.2 写的 `codesign --force --deep --sign -`：全部成功，之后深度校验都通过、都能跑。
- `spctl -a` 对所有变体都是 `rejected`：这是预期的，ad-hoc 签名通不过 Gatekeeper 的评估。
- dmg 挂载后里面的应用、zip 解出来的应用，深度校验都通过（本机、CI）。

### C. 隔离标记（只在 CI macOS 上）

做法：给 `.app` 里所有文件加上 `com.apple.quarantine`（`0081;…;Safari;…`，即“浏览器下载、还没被用户放行”），再做下面几件事。两份独立的副本，4 轮里后 3 轮是现在的做法。

| 做法 | 结果 |
| --- | --- |
| 清掉标记（`xattr -dr com.apple.quarantine`）再 `open` | **打开了**，窗口出来，管理进程拉起（3/3 轮）。这是通过标准 |
| 带着标记 `open` | `open` 命令一直不返回（等了 30 秒），应用没有启动；系统日志里是隔离处理程序在工作，并在 `…/T/AppTranslocation/<随机>/d/` 下建了一份只读的映像（3/3 轮）。隔离标记没有被清掉 |
| 上一步的对话框还挂着时再 `open` 一次 | 立刻失败，`_LSOpenURLsWithCompletionHandler() failed with error -10673`（3/3 轮）。第 1 轮里这一条连累了后面所有的实验，所以后来改成用独立的副本 |
| 带着标记，直接执行内置命令行 | **正常**，`--version` 退出码 0（首次 145 到 777 毫秒，4/4 轮），还能拉起管理进程（3/3 轮） |
| dmg 带标记，用 `hdiutil attach` 挂载 | 里面的应用**没有**隔离标记。这是命令行挂载的结果，Finder 双击挂载没有测 |

看不到屏幕，所以对话框的文字和按钮没有记录。

### D. 打开应用，管理进程，单实例

用 `open -g` 打开（和双击走同一条路，只是不抢焦点）。本机 1 次完整运行，CI 4 轮（第 1 轮受隔离实验连累，不算）。

| | 本机 | CI macOS | CI Windows |
| --- | --- | --- | --- |
| 窗口显示，标题正确 | 是 | 是 | 是 |
| 管理进程由应用拉起，可执行文件在包内，`launcher` 是 `electron` | 是 | 是 | 是 |
| 从开始连接到握手完成 | 76 | 183 到 315（3 轮） | 77 到 86（3 轮） |
| 管理进程空闲内存 | 61.9 MB | 61.2 MB | 71.2 MB |
| 包里的命令行连上的是同一个管理进程 | 是 | 是 | 是 |
| 应用正常退出后：管理进程、命令行持有的运行、端口都还在 | 是 | 是 | 是 |
| 管理进程有没有登记到 LaunchServices（登记了才可能有 Dock 图标） | 30 次取样全是没有 | 同左 | 不适用 |
| 管理进程的子进程（Helper）数 | 0 | 0 | — |

单实例：先强杀管理进程（留下残留的 socket 文件），再同时启动应用和 4 个命令行，各自“连不上就启动”。本机 5 轮、CI 每轮 5 轮：每轮都只有一个实例号、只多一条“正在监听”的记录，没有客户端失败。K1 的锁在打包后同样有效。

Windows 上应用运行时安装目录里有 5 个 `RunyardK3.exe`（主进程、GPU、渲染、工具进程，加管理进程）。

### E. 用应用自带的运行时跑命令行

**Dock 图标、焦点、多余的进程。** 让一个命令行进程活 3 秒（`ensure --hold`），每 100 毫秒看一次：有没有登记到 LaunchServices、有没有子进程、最前面的应用变没变。本机 1 次、CI 4 轮：30 次取样全是“没登记”，子进程 0 个，最前面的应用没变。**没有 Dock 图标，不抢焦点，没有 Helper。**

**启动耗时。** 每种写法 40 次（Windows 30 次），几种写法轮流跑，事先热身一次不计。`status` 是连上管理进程问一次 `supervisor.info` 再退出。

macOS：

| 写法 | 本机 | CI macOS |
| --- | --- | --- |
| 系统的 Node 24，`--version` | 25.1 / 26.3 / 27.4 | 42.3 / 56.4 / 188.7 |
| 应用运行时，直接执行，`--version` | 51.4 / 52.6 / 55.2 | 81.7 / 108.4 / 127.3 |
| 应用运行时，经 `bin/runyard`，`--version` | **54.4 / 55.8 / 58.6** | **91.2 / 120.0 / 126.9** |
| 应用运行时，经 PATH 上的符号链接、最小环境，`--version` | 57.0 / 60.7 / 62.7 | 97.3 / 121.8 / 127.3 |
| 系统的 Node 24，`status` | 31.9 / 33.5 / 34.3 | 59.8 / 75.1 / 85.7 |
| 应用运行时，经 `bin/runyard`，`status` | 58.8 / 61.3 / 61.7 | 94.3 / 117.9 / 135.1 |
| 对照：`/bin/sh -c :` | 3.9 / 4.2 / 4.4 | 5.9 / 10.5 / 11.7 |

CI 那台虚拟机每轮快慢不同：4 轮里“经 `bin/runyard` 的 `--version`”中位数是 64 到 91，p95 是 78 到 120。

Windows（CI）：

| 写法 | 第 4 轮 | 第 2、3 轮的中位数 / p95 |
| --- | --- | --- |
| 系统的 Node 24，`--version` | 55.2 / 61.4 / 63.1 | 63.5 / 118.3，68.7 / 74.7 |
| 应用运行时，直接执行，`--version` | 40.5 / 46.5 / 48.3 | 45.8 / 74.5，50.3 / 57.9 |
| 应用运行时，经 `runyard.cmd`，`--version` | **63.5 / 70.2 / 74.7** | 72.7 / 137.9，80.8 / 103.3 |
| 应用运行时，经 `runyard.cmd`，`status` | 73.2 / 88.1 / 133.9 | 84.0 / 118.0，94.1 / 105.0 |
| 对照：`cmd /c exit` | 16.1 / 18.1 / 21.6 | — |

- 应用运行时比系统的 Node 在 macOS 上慢约 26 到 40 毫秒；在 Windows 的 CI 机器上直接执行反而快一些。shell 脚本这一层在 macOS 上约 3 毫秒，`cmd` 这一层在 Windows 上约 20 毫秒。
- **装好之后的第一次执行要单独看**：本机 2076 毫秒，CI macOS 95 到 543 毫秒（4 轮）（系统第一次执行一个新的大二进制时要检查它）。之后就是上表的数字。
- Windows 的 CI 上 Defender 实时防护是关的，用户电脑上会慢一些：真机复核。

**PATH 上的符号链接（macOS）。** 在临时的 bin 目录里建符号链接指向 `Contents/Resources/bin/runyard`，用 `env -i` 只给 `PATH` 和 `HOME`，分别从 `sh`、`zsh -f`、`bash --noprofile --norc` 调用：都能找到、版本号正确、带空格、中文、引号的参数原样到达、退出码 7 和 9 原样传回。相对路径的符号链接也行。安装位置故意带空格和中文（`应用 Apps/RunyardK3.app`）。本机 1 次，CI 4 轮，全部通过。

**三种终端（Windows，CI）。** PATH 按“系统 PATH 加注册表里的用户 PATH”拼出来，证明应用写进注册表的那一项够用。参数是 `"hello world" "中文 参数" "a&b" "50%" "x^y" ""`。第 2、3、4 轮结果相同。

| 从哪里 | 找到的是 | 参数 | 退出码 7 |
| --- | --- | --- | --- |
| cmd | `bin\runyard.cmd` | 6 个全对 | 传回 |
| Windows PowerShell 5.1 | `bin\runyard.cmd` | **只到 `a` 为止，后面丢了**，并报 `'b' is not recognized as an internal or external command` | 传回 |
| PowerShell 7 | 同上 | 同上 | 传回 |
| PowerShell 5.1，去掉 `a&b` | 同上 | `x^y` 变成 **`xy`**，其余对 | — |
| Git Bash | `bin/runyard`（没有扩展名的那个脚本） | 6 个全对 | 传回 |
| Git Bash，目录里只有 `.cmd` 时输入不带扩展名的名字 | **找不到，退出码 127**；写全 `xxx.cmd` 才行 | — | — |

原因：PowerShell 只给带空格的参数加引号，`a&b` 原样交给 `.cmd`，再被 cmd 当成命令分隔符。这是所有 `.cmd` 垫片的通病。

对照：另放一个 `runyard.ps1`（npm 的垫片就带这个）能不能解决。结论是**不能**：
- PowerShell 优先用 `.ps1`，参数确实全对了；
- 但执行策略是 `Restricted` 时（Windows 客户端版本的默认值），`runyard` 直接报“running scripts is disabled on this system”，连 `.cmd` 都轮不到；
- 而且 Electron 的可执行文件是图形界面程序（实测 PE 头里的子系统是 2），PowerShell 5.1 启动它之后不等它结束：退出码拿到的是 0 而不是 7，输出在后面的命令之后才出现。`.cmd` 没有这个问题，因为批处理文件里 cmd 会等。

控制台黑窗口：CI 上看不到。机制是，应用的可执行文件是图形界面程序，自己不会开控制台；从 cmd、PowerShell、Git Bash 里经 `.cmd` 或 shell 脚本调用时沿用已有的控制台。真机复核。

### F. 链接协议

macOS（本机 1 次，CI 4 轮，结果相同）：

| 情况 | 结果 |
| --- | --- |
| 应用在临时目录（`/private/var/folders/…/T/`）里，已经用 `open` 打开过 | 系统登记了它（`lsregister -dump` 里有，声明了协议），但标着 `in-temp-dir`，**不把它当处理程序**：`open 'runyard-k3://…'` 报 `kLSApplicationNotFoundErr` |
| 同一份应用放到普通目录，打开一次 | 成为处理程序。标记里没有 `in-temp-dir` |
| 应用在运行，`open 'runyard-k3://open/demo-a?x=1'` | 送到正在运行的那个进程的 `open-url` 事件，地址完整 |
| 应用没在运行，`open 'runyard-k3://open/demo-b'` | 应用被启动，`open-url` 在 `ready` **之前**就到了；地址不在命令行参数里 |
| 用完 `lsregister -u` 并删除 | 处理程序查不到了 |

“普通目录”用的是仓库检出目录下的 `spikes/k3/.k3-install-<随机>/`，用完即删，没有碰 `/Applications`。

Windows（CI，命令行 `start`，第 2、3、4 轮）：

| 情况 | 结果 |
| --- | --- |
| 谁登记的 | 我们的钩子（`customInstall` 写 `HKCU\Software\Classes\runyard-k3`）。electron-builder 的 NSIS 目标不登记：它的代码里没有处理 `protocols`（读源码），安装后注册表里那一项的内容就是钩子写的那一句 |
| 应用没在运行 | 应用被启动，地址在命令行参数里 |
| 应用在运行 | 系统又启动一个实例，它拿不到单实例锁，把命令行交给第一个实例后退出；第一个实例的 `second-instance` 事件里拿到完整地址（含 `&`） |

### G. 系统通知（只在 CI macOS 上）

主进程里 `new Notification(...).show()`。`Notification.isSupported()` 返回 `true`，随后收到 `failed` 事件，错误是 **`Notifications are not allowed for this application`**。系统日志：`usernoted` 记了 `Failed to find or validate client of identifier dev.runyard.spike.k3`，授权请求 `didGrant: 0 hasError: 1`。第 2、3、4 轮相同。ad-hoc 签名不算数，和设计的预期一致，设计本来就不依赖它。

### H. 管理进程活着时替换 `.app`（macOS）

两份构建：v1（0.3.0，协议版本 1）和 v2（0.3.1，协议版本 2）。应用启动时多做一步 §8.2 写的检查：发现文件里记的可执行文件不存在了，就按“管理进程较旧”处理。本机 13 次，CI 4 轮。

| 场景 | 结果 |
| --- | --- |
| **A. v1 换成 v2，替换时有一个运行。** 像 Finder 那样：旧的挪走，新的放进来，再把旧的彻底删掉 | 旧管理进程和运行都还活着；发现文件里的路径**仍然存在**（已经是新文件）；新版命令行能连上它，并经它再起一个运行（成功，带 `SUPERVISOR_OLDER_COMPAT` 提示）；新版应用启动后沿用旧管理进程并拿到同一个提示。停掉运行后再启动应用：旧的被请走，新的起来，协议版本 2 |
| **B. 同一个协议版本的另一份构建**，管理进程空闲 | 应用启动后**沿用旧的管理进程**。路径检查没有触发（路径存在），握手表也认为“版本相同，直接用” |
| **C. 不挪走旧的，直接覆盖**（`ditto` 到已有的 `.app` 上） | 旧管理进程没死，还能应答；覆盖后的包签名校验通过；新版应用启动后把它换掉 |
| **D. 应用被挪到别处** | 路径不存在了。空闲时：旧的被请走，新的从新位置起来。有运行时：保留旧的，不动运行 |

A、C、D 是设计想要的行为。**B 是缺口**。

一处没查清的现象：场景 A 里“把旧包彻底删掉”之后，本机 13 次里有 2 次旧管理进程在半秒内不见了。第一次当时那个运行正卡在系统的授权框上（见“做实验时踩到的事”），第二次没有这个情况。加了取证（管理进程最后的日志、系统的崩溃报告）之后又跑了 9 次本机、4 轮 CI，没有再出现，所以没抓到原因。

### I. Windows：安装、PATH、卸载

静默安装（`setup.exe /S`）后：

- 装在 `%LOCALAPPDATA%\Programs\runyard-spike-k3`。**目录名取的是 `package.json` 的 `name`，不是产品名。** 按用户安装，不需要管理员。
- “卸载或更改程序”里的条目：`RunyardK3 0.3.0`，发布者取自 `author`。
- 开始菜单和桌面各一个快捷方式（打包工具的默认）。
- 安装器不动 PATH。由应用来加（模拟设置里的“安装命令行工具”）：注册表里的值类型保持 `REG_EXPAND_SZ`，原有的内容一个字符不变，再点一次不会重复添加。

卸载后和安装前逐项比较（第 4 轮）：

| 项目 | 结果 |
| --- | --- |
| 用户 PATH | **逐字相同**（含末尾的分号），类型相同 |
| 链接协议的注册表项、卸载条目、`HKCU\Software\<GUID>` | 都没了 |
| 安装目录、开始菜单和桌面的快捷方式 | 都没了 |
| `%APPDATA%`、`%LOCALAPPDATA%` 下名字带 runyard 的目录 | 没有新增 |

两处是踩到之后才改对的：第 2 轮里 PATH 少了末尾那个分号（当时是拆开再拼回去，现在只增删自己那一段）；第 1 轮里卸载后留下了 `%LOCALAPPDATA%\runyard-spike-k3-updater`（安装器建的更新缓存目录，模板的卸载不删，现在由钩子删）。

### J. Windows：管理进程活着时覆盖安装、卸载

每个场景开始时：应用拉起管理进程，命令行起一个它自己持有的运行（一个监听端口的 Node 服务）。三种安装包，区别只在 NSIS 脚本。第 4 轮的结果；“只剩管理进程”的几行第 2、3 轮相同。

**本文的钩子**（先调用内置命令行请管理进程退出，再走打包工具原来的检查）：

| 场景 | 安装器 | 管理进程 | 运行 | 装上的版本 |
| --- | --- | --- | --- | --- |
| 应用已退出，只剩管理进程和运行；0.3.0 → 0.3.1 | 退出码 0，14 秒 | 自己退出（记了 `shutdown-begin: requested:install`），74 毫秒 | 被停掉，端口释放 | 0.3.1 |
| 应用窗口还开着；0.3.1 盖 0.3.1 | 退出码 0，16 秒 | 同上，71 毫秒 | 被停掉 | 0.3.1，装完能正常启动，新管理进程是协议版本 2 |
| 卸载 | 成功，8 秒；安装目录没了 | 同上，85 毫秒 | 被停掉 | — |

钩子报告了 `runs: 1`，这就是安装器要事先告诉用户“会停掉几个运行”的那个数。覆盖安装时 PATH 和链接协议都保留。**那个运行是被停掉的，不会保留。**

**对照一：打包工具自带的检查，不加钩子**

| 场景 | 安装器 | 之后 |
| --- | --- | --- |
| 只剩管理进程；覆盖安装 | 退出码 0 | **管理进程还活着，运行还在，端口还占着，发现文件还在。** 旧文件被挪到 `%TEMP%\ns*.tmp\old-install` 留在那里 |
| 应用窗口也开着；覆盖安装 | 退出码 0 | 应用、管理进程都被直接结束，管理进程没来得及记任何日志，发现文件留了下来；那个运行也没了（第 3、4 轮） |
| 只剩管理进程；卸载 | 退出码 0，卸载条目没了 | **管理进程和运行还活着；安装目录还在，里面剩一个删不掉的 `RunyardK3.exe`** |

为什么只剩一个进程时它找不到：模板用 `(Get-CimInstance … | ? {…}).Count -gt 0` 判断。把同一句拿出来问，包上 `@( )` 之后数出来是 1（只剩管理进程时）和 5（应用也开着时），而安装器的行为正好是“1 个时当没有，5 个时全杀”。Windows PowerShell 5.1 里单个对象没有可靠的 `.Count`，这是打包工具的缺陷，正好打在“只剩一个没有窗口的管理进程”这个设计上。

**对照二：把检查整个关掉**

| 场景 | 安装器 | 之后 |
| --- | --- | --- |
| 覆盖安装 | 退出码 0 | 管理进程、运行都还活着；新装的命令行能用；`%TEMP%` 里留下 2 个 `old-install` |
| 卸载 | 退出码 0 | 同对照一：留下 `RunyardK3.exe`，进程还活着 |

### K. 未签名的安装包（Windows，CI）

| 项目 | 结果 |
| --- | --- |
| `Get-AuthenticodeSignature` | 安装包和装好的 `RunyardK3.exe` 都是 `NotSigned` |
| Defender 扫描（`MpCmdRun -Scan -ScanType 3`，病毒库 1.459.676.0） | 安装包和主程序都是 `found no threats` |
| 给安装包加上“来自互联网”的标记（`Zone.Identifier`，`ZoneId=3`），用普通方式启动进程（`CreateProcess`）静默安装 | 成功，退出码 0。装出来的文件不带这个标记 |
| 同一个文件经 `ShellExecute` 启动（资源管理器双击走的路） | 没有运行，报 `The operation was canceled by the user`（没有可交互的桌面，系统的确认框等于被取消） |

这说明拦截发生在“经资源管理器打开”这一层，不在进程创建这一层，脚本静默安装不受影响。**真正的 SmartScreen 画面和智能应用控制是 K14，在真机上做。** CI 机器上相关的策略键都是空的。

### L. 打包开关

主构建的设置：`runAsNode` 开；`enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments`、`enableCookieEncryption`、`loadBrowserProcessSpecificV8Snapshot`、`grantFileProtocolExtraPrivileges` 关；`enableEmbeddedAsarIntegrityValidation`、`onlyLoadAppFromAsar` 开。两个系统上应用都正常启动。

- **关掉 `runAsNode`**（CI 两个系统）：想当命令行用（`ELECTRON_RUN_AS_NODE=1 <可执行文件> cli.mjs --version`），版本号没有打印，**起来的是一个完整的应用**，脚本路径成了它的普通参数。这个应用自己去拉管理进程时，拉起来的又是一个应用实例（拿不到单实例锁，立刻退出），15 秒后报 `SUPERVISOR_UNAVAILABLE`。管理进程和内置命令行都没了。
- **关掉 `grantFileProtocolExtraPrivileges`**：`loadFile()` 读 asar 里的页面失败，`ERR_FILE_NOT_FOUND`（本机、CI）。只把这一个开关打开，同样的代码就能加载。主构建走的是自己注册的 `app://runyard/`，正常。
- `enableEmbeddedAsarIntegrityValidation` 开着时两个系统都能启动。
- `enableNodeOptionsEnvironmentVariable`、`enableNodeCliInspectArguments` 关着，不影响当作 Node 运行的管理进程和命令行。

## 对照通过标准逐条判定

| 通过标准（§11.1 的 K3 行） | 判定 | 证据 |
| --- | --- | --- |
| 清除隔离标记后能打开 | **通过**（CI macOS 26.6.2）；本机未验证 | C 节，3/3 轮。本机没有做隔离实验，只做了“没有标记时能打开” |
| 链接生效 | macOS **通过**（应用不在临时目录时）；Windows 命令行部分**通过**，真实浏览器是真机项目 | F 节 |
| 系统通知能否发出 | 发不出，与预期一致，不影响设计 | G 节 |
| 命令行正常：不出 Dock 图标 | **通过** | E 节，本机和 CI 每次 30 个取样 |
| 命令行正常：启动不慢于 150 毫秒 | **通过**：中位数 macOS 54（本机）、64 到 91（CI），Windows 64 到 81（CI）。p95 在 CI 上到过 120（macOS）和 138（Windows），没有超过 150 | E 节 |
| 打包工具对 pnpm 目录结构如预期 | **通过** | A 节 |
| 打包工具对 ad-hoc 签名如预期 | **不如预期**：它不自动做。写明 `identity: "-"` 后通过 | B 节 |
| 各打包开关如预期 | **通过**，并查实了两条限制 | L 节 |
| 两种架构的签名校验通过 | **通过**（arm64、x64 的深度校验）。x64 没有在 Intel 的 Mac 上运行过 | B 节 |
| 管理进程活着时覆盖安装和卸载都成功 | **通过**（加钩子之后）；不加钩子是“报成功但状态是坏的” | J 节 |
| 卸载后用户的 PATH 里没有残留 | **通过**，与安装前逐字相同 | I 节 |
| macOS 上替换应用后旧的管理进程被换掉（§8.2） | **部分通过**：协议版本变了、或应用被挪走时通过；同一协议版本原地替换时**不通过** | H 节 |

## 结论

**“用应用自带的运行时执行命令行”可以接受，不需要随应用带一个独立的 Node。** 没有 Dock 图标、不抢焦点、没有多余的进程；比系统的 Node 慢 26 到 40 毫秒，离 150 毫秒的上限还有余量。唯一明显的慢是装好后的第一次执行（0.1 到 2.1 秒），之后不再出现。

设计原文要改的地方见下一节。

### 能用的 electron-builder 配置

完整的在 `electron-builder.config.mjs`。要点：

```js
export default {
  appId: "dev.runyard.spike.k3",
  productName: "RunyardK3",
  files: ["app/**", "package.json"],
  asar: true,
  // 管理进程和命令行：普通 JS 文件，放在 asar 外面
  extraResources: [{ from: "../k1", to: "runtime", filter: ["supervisor.mjs", "cli.mjs", "lib/*.mjs"] }, { from: "runtime", to: "runtime" }],
  protocols: [{ name: "Runyard K3 spike", schemes: ["runyard-k3"] }], // 只对 macOS 起作用
  electronFuses: {
    runAsNode: true, // 必须开
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false, // 界面必须走自己的协议
    resetAdHocDarwinSignature: true,
  },
  publish: null,
  mac: {
    identity: "-", // 明确 ad-hoc。不写这一行时打包工具不签
    hardenedRuntime: false,
    notarize: false,
    extraResources: [{ from: "bin/mac", to: "bin" }],
  },
  win: { extraFiles: [{ from: "bin/win", to: "bin" }] },
  nsis: { oneClick: true, perMachine: false, runAfterFinish: false, deleteAppDataOnUninstall: false, differentialPackage: false, include: "build/installer.nsh" },
};
```

构建时再设两个环境变量：`CSC_IDENTITY_AUTO_DISCOVERY=false`（不许它去钥匙串里找证书）和 `ELECTRON_BUILDER_CACHE`（它自己的下载缓存放哪）。pnpm 一侧：`allowBuilds` 里要写 `electron-winstaller: false`，否则安装报错（见“安装过的依赖”）。

### 安装器的钩子

完整的在 `build/installer.nsh`。核心是这一个宏，安装器和卸载器开始时都会展开它：

```nsis
!include "getProcessInfo.nsh"
Var pid

!macro customCheckAppRunning
  ${if} ${FileExists} "$INSTDIR\bin\runyard.cmd"
    ; 第 1 步：请管理进程自己退出（它会先停掉所有运行）
    nsExec::ExecToStack '"$SYSDIR\cmd.exe" /D /C ""$INSTDIR\bin\runyard.cmd" installer-stop --reason install"'
    Pop $0
    Pop $1
  ${endif}
  ; 第 2 步：打包工具原来的检查，处理应用窗口本身
  !insertmacro IS_POWERSHELL_AVAILABLE
  !insertmacro _CHECK_APP_RUNNING
!macroend
```

`installer-stop`（`runtime/k3-installer-helper.mjs`）做的是 §8.2 写的那几步：读发现文件、连上、发 `supervisor.shutdown { ifIdle: false, reason: 'install' }`、最多等 5 秒；还活着就核对进程身份（可执行文件路径、启动时间）后结束它。另外两个宏：`customInstall` 登记链接协议；`customUnInstall` 在不是覆盖安装时（`${ifNot} ${isUpdated}`）调用 `path-remove`、删链接协议、删更新缓存目录。

钩子里的“超过 5 秒就强行结束”这一支没有被走到过：每次管理进程都在 100 毫秒内自己退出了。

### 下载页和说明文件要告诉用户什么

macOS（核对 §10 的说法）：

- “双击后被系统拦住，打不开”：**证实**被拦住（应用没有启动，`open` 挂住）。对话框上有什么按钮、系统设置里“仍要打开”这条路：**没法在这里核对**，仍然是 §10 原来的依据。
- “懂命令行的可以执行 `xattr -dr com.apple.quarantine /Applications/Runyard.app`”：**证实**，清掉之后能打开。
- 要补一句：**先把应用拖进“应用程序”文件夹再打开**。在下载文件夹或磁盘映像里直接打开，链接（`runyard://`）不会生效。
- 要补一句：命令行不受隔离标记影响。
- 系统通知发不出：**证实**。
- “如果连 ad-hoc 签名都没有，用户看到已损坏”：没有看到画面；实测是 macOS 27 上进程直接被杀，macOS 26.6.2 上还能跑。

Windows 的说法在 K14 之前保持暂定。这里只能补一条：命令行静默安装不受“来自互联网”标记的影响。

## 对技术设计的具体改动建议

1. **§8.2 第 4 条（ad-hoc 签名）**：把“electron-builder 26.17.0 是否还会自动做，只有一个第三方来源说不会【未核实】，所以在打包后自己执行 `codesign --force --deep --sign -` 并校验”改为：“electron-builder 26.17.0 不会自动做（K3 实测）。在配置里写 `mac.identity: "-"`，并开着 `electronFuses.resetAdHocDarwinSignature`；打包后用 `codesign --verify --deep --strict` 校验，校验不过就让构建失败。改了打包开关而没有重签的包在 macOS 27 上一启动就被杀。”
2. **§8.2 “安装器与管理进程”第一段**：把“安装器会失败或要求重启”改为：“安装器不会失败：覆盖安装和卸载都报成功，但旧的管理进程和它的运行还活着，卸载后安装目录里留下删不掉的可执行文件（K3 实测）。打包工具自带的检查在只剩一个进程时找不到它。”
3. **§8.2 表格“Windows 安装开始时”一行**：在末尾补：“做法是定义 NSIS 的 `customCheckAppRunning` 宏：先调用 `bin\runyard.cmd installer-stop`，再展开模板原来的 `_CHECK_APP_RUNNING`。这个宏对安装器和卸载器都生效（K3 已验证）。”
4. **§8.2 表格“Windows 卸载时”一行**：补：“删 PATH 由钩子在删文件之前调用内置命令行来做，直接改注册表里的值、保持原来的类型，只删自己那一段，不用 `setx`；覆盖安装时（`isUpdated`）不删。另外要删 `%LOCALAPPDATA%\<包名>-updater`，并删掉钩子自己写的链接协议注册表项。”
5. **§8.2 表格“macOS 应用启动时”一行**：把“如果发现发现文件里记的可执行文件路径已经不存在”改为：“如果发现管理进程不是当前这一份应用拉起的。判断依据是发现文件里新增的‘构建标识’（版本号加构建时生成的随机串），不是路径：原地替换 `.app` 之后路径照样存在（K3 实测）。路径不存在是其中一种情况。”
6. **§5.4 握手表第一行**“两边协议版本相同：直接用。产品版本不同只记日志”：改为“两边协议版本相同、构建标识也相同：直接用。构建标识不同：没有运行时换新，有运行时沿用并在设置页提示。”相应地 §5.4 第 1 条里发现文件记的内容加上构建标识。
7. **§5.4 表格“随桌面应用”一行**：“macOS 是在用户的 bin 目录建一个符号链接”后面补“指向 `Contents/Resources/bin/runyard`（一个 shell 脚本，它顺着符号链接找到应用，再用应用的可执行文件执行命令行）”；“里面有 `runyard.cmd`”改为“里面有 `runyard.cmd` 和一个没有扩展名的 `runyard`（给 Git Bash 用，它不认 `.cmd`）；`runyard.cmd` 里只许有 ASCII 字符”。
8. **§5.4 末尾“仍未核实”一句**：换成：“K3 已核实：没有 Dock 图标；`--version` 的中位数 macOS 54 到 91 毫秒，Windows 64 到 81 毫秒。已知的限制：在 PowerShell 里经 `runyard.cmd` 传参时，不带空格又含 `&`、`^`、`|`、`<`、`>` 的参数会被 cmd 改掉；加 `.ps1` 垫片不能解决。要彻底解决得带一个控制台程序做入口，MW 时和 K2 的 `runyard-job.exe` 一起定。”
9. **§6.5 表格“打包开关”一行**：补一句：“`grantFileProtocolExtraPrivileges` 关掉后界面不能用 `file://` 读 asar 里的文件，所以 `app://runyard/` 是必须的。关掉 `runAsNode` 的后果已实测：管理进程和内置命令行都起不来。”
10. **§6.5 表格 `runyard://` 两行**之间补一行说明送达方式：“macOS 上经 `open-url` 事件送达，应用没在运行时会早于 `ready`，要在最前面就注册处理函数；Windows 上在命令行参数里，应用在运行时经 `second-instance` 事件送达。Windows 上的注册表项由安装器的钩子写，打包工具不写。”
11. **§8.1 Electron 一行**：把“内置 Node 官方时间表写 24.18.1，原文写的 24.21 与时间表不符，以实际 `process.versions` 为准（M0a 核对）”改为“内置 Node 24.21.0、Chromium 152.0.7977.130（K1、K3 实测）”。
12. **§8.1 electron-builder 一行**的“已知漏洞”一栏补：“它的间接依赖 `http-cache-semantics` 4.2.0 有一条高危公告 GHSA-ch52-4w7c-c8xp（只在构建时下载用），修复版 4.3.0 于 2026-10-04 发布，2026-10-18 满 14 天。在那之前，带 electron-builder 的锁文件会被 `pnpm audit` 报出来。”
13. **§8.2 新增一条**：“Windows 的安装目录是 `%LOCALAPPDATA%\Programs\<package.json 的 name>`。桌面应用那个包的 `name` 要取成想让用户看到的目录名。”
14. **§8.6 的 `allowBuilds`**：建桌面应用包时要加 `electron-winstaller: false`（electron-builder 的间接依赖，带安装脚本，我们用不到）。不表态的话 `pnpm install` 直接报错。
15. **§10 macOS 表**：“第一次打开”一行的对策补“并写明先拖进‘应用程序’文件夹”；“系统通知”一行的“很可能发不出…ad-hoc 签名算不算，文档没说【未核实】”改为“发不出（K3 实测：`failed` 事件，`Notifications are not allowed for this application`）”；“ad-hoc 签名”一行的依据改为“K3 实测”。新增一行“访问桌面、文稿、下载文件夹”：见下面“做实验时踩到的事”，标【未验证】。
16. **附录 B**：K3 名下的几行按上面的结果结掉。

## 做实验时踩到的事

1. **系统以应用的名义弹“访问桌面文件夹”的授权框。** 第一次本机运行时，“用户的开发服务器”替身是仓库里的一个脚本，仓库在 `~/Desktop` 下面。由应用拉起的管理进程去启动它，子进程一直卡着不动（没有输出，端口不通，30 秒），直到被结束。同一个脚本由终端里的命令行拉起的管理进程启动就正常。把脚本复制到临时目录后一切正常。没有看到屏幕，系统日志里也没有留下记录，所以“弹了授权框”是推断。对产品的含义：**由应用拉起的管理进程，它启动的运行在系统看来是 Runyard 在访问文件**。项目默认在 `~/Runyard`，不属于受保护的文件夹；用户把项目放在桌面、文稿、下载里时会被问。ad-hoc 签名的应用每次更新后身份都变，授权很可能要重新给【未验证】。
2. **PowerShell 5.1 里单个对象的 `.Count`**：见 J 节。
3. **进程号重用**：第 3 轮 CI 里，新的管理进程拿到了和前一个实验里同样的进程号，脚本按“进程号加启动时间”核对后拒绝结束它，留下了一个进程。这正好说明 §2.4 写的“按进程号加启动时间核对身份”是必要的。
4. **`.cmd` 文件里不能有中文注释**：UTF-8 的中文在双字节代码页（如 936）下可能把换行吞掉。没有实测（CI 是 437），按已知的机制直接规避了。
5. **带隔离标记的应用被 `open` 之后，同一个应用再 `open` 一律失败**，直到那个对话框被处理：见 C 节。

## 未验证

- macOS：Gatekeeper 对话框的内容；系统设置里“仍要打开”这条路；Finder 双击挂载 dmg 后隔离标记的传递；x64 的包在 Intel 的 Mac 上运行；负责人的 Mac 上“清除隔离标记后能打开”（只在 CI 的 macOS 26.6.2 上做了）；ad-hoc 签名的应用更新后隐私授权是否要重新给；场景 A 里那 2 次旧管理进程消失的原因。
- Windows：见下一节。另外 arm64 的包没有打。
- 钩子里“5 秒后强行结束”那一支；管理进程卡死、连不上时钩子的表现。
- 非静默安装时安装器的界面（包括事先告诉用户“会停掉 N 个运行”）：钩子拿得到这个数，界面没有做。
- 自动更新、Homebrew、winget、Scoop：不在这次范围内。

## 需要在负责人的 Windows 真机上复核

1. K14 的全部：用 Edge 下载后双击安装包时的 SmartScreen 画面；开着智能应用控制时的表现；杀毒软件的反应。
2. `runyard://`：在 Edge、Chrome 里点链接，浏览器的确认框，应用在运行和没在运行两种情况。
3. 普通（非管理员）用户下：按用户安装、应用改 PATH、钩子停管理进程、卸载。CI 是管理员。
4. Defender 实时防护开着时命令行的启动耗时，以及第一次执行的耗时。CI 上是关的。
5. 黑窗口：从 cmd、PowerShell、Windows Terminal、Git Bash、资源管理器里分别执行 `runyard`，有没有窗口闪一下；交互式控制台里（不是管道）输出是否正常显示。
6. 中文版 Windows（代码页 936）、用户名带中文或空格时：安装目录、`runyard.cmd`、PATH。
7. 应用改完 PATH 之后，不注销，新开的终端里能不能直接用 `runyard`。
8. 非静默安装：管理进程活着时双击安装包，看到的提示和结果。

## 安装过的依赖和查过的内容

`package.json` 里三个，都是精确版本，都满 14 天；`pnpm install` 一共装了 272 个包。

| 包 | 版本 | 发布日期 | 查了什么 |
| --- | --- | --- | --- |
| `electron`（开发依赖） | 44.4.5 | 2026-09-23 | §8.1 已选定。`pnpm deps:lookup electron`：OSV、GitHub 公告库无 |
| `electron-builder`（开发依赖） | 26.17.0 | 2026-09-26 | §8.1 已选定。`pnpm deps:lookup electron-builder`：本包 OSV、GitHub 公告库无 |
| `chokidar`（正式依赖，只为检验 pnpm 目录结构下的打包） | 5.0.0 | 2025-11-25 | §8.1 已选定。`pnpm deps:lookup chokidar`：无。带进来 `readdirp` 5.1.1 |

- **没有提交锁文件。** `pnpm audit` 报 2 条：高危 GHSA-ch52-4w7c-c8xp（`http-cache-semantics` ≤ 4.2.0，路径 `electron-builder > app-builder-lib > @electron/get > got > cacheable-request`），中危 GHSA-hp3w-g68c-fv3c（`sprintf-js`，没有修复版）。高危那条的修复版 4.3.0 发布于 2026-10-04，不满 14 天，年龄规则不让装，也没有绕过。所以按任务说明的做法：不提交锁文件，CI 在一次性的机器上现装（仍受 `pnpm-workspace.yaml` 里 `minimumReleaseAge: 20160` 约束），并打印 `pnpm list` 和 `pnpm audit`。这个包只在构建时下载打包工具用，不进成品。
- **安装脚本白名单**：`electron: true`、`esbuild: true`（与根目录相同），另加 **`electron-winstaller: false`**。它是 electron-builder 的间接依赖，安装脚本只是按架构挑一个 7z，我们只打 NSIS 用不到。`strictDepBuilds` 默认开着，不写这一行安装就失败（`ERR_PNPM_IGNORED_BUILDS`）。写的是“不许跑”，没有放行任何新的脚本。
- `electron` 44.4.5 这个包没有安装脚本。Electron 本体是打包工具在构建时下载的。

**构建时下载了什么**（看缓存目录和构建日志；地址和校验和写死在打包工具的源码里，没有抓包核对）：

| 东西 | 来源 | 放在哪 |
| --- | --- | --- |
| Electron 44.4.5 的 zip：darwin-arm64、darwin-x64、win32-x64 | `github.com/electron/electron` 的发布页，经 `@electron/get`，按 `SHASUMS256.txt` 校验 | `~/Library/Caches/electron`（任务说明允许留下，留着） |
| `7zip@1.0.0` | `github.com/electron-userland/electron-builder-binaries` 的发布页，源码里带 SHA-256 | 临时目录，已删 |
| `dmg-builder@1.2.5`（`dmgbuild`，自带一份 Python 3.14） | 同上 | 同上 |
| `nsis-3.0.4.1`、`nsis-resources-3.4.1` | 同上 | 同上 |

没有下载 `winCodeSign`，也没有下载 Wine。本机还做过一次“在 macOS 上交叉打 Windows 安装包”来检查 NSIS 脚本能不能编译：成功，82 秒。

**CI 用到的 Action**：只有任务说明允许的四个，哈希与 `.github/workflows/ci.yml`、`spike-k6.yml` 里的相同：`actions/checkout`、`pnpm/action-setup`、`actions/setup-node`、`actions/upload-artifact`。

## 清理确认

本机（最后一次完整运行，`results/darwin-arm64-local.json` 的 `cleanup`）：

- 进程：命令行里带本次临时目录名的进程 0 个；可执行文件路径是 `Contents/MacOS/RunyardK3` 或名字带 `RunyardK3 Helper` 的进程 0 个。
- 临时根目录、指针文件、仓库下的 `.k3-install-*`：都删了。
- 链接协议：`runyard-k3://` 的处理程序查询结果是“无”；`lsregister -dump` 里提到这个协议或本次临时目录的行数是 0。用 `open` 打开过的每个路径都执行过 `lsregister -u`。
- 用户目录里应用留下的东西：只有 `~/Library/Preferences/dev.runyard.spike.k3.plist`，已删（`defaults delete` 加删文件）；`Application Support`、`Saved Application State`、`Caches`、`HTTPStorages`、`WebKit`、`Logs` 下都没有它的东西。
- 系统为“改了开关没重签”的那份构建写的崩溃报告（`~/Library/Logs/DiagnosticReports/RunyardK3-*.ips`，每次运行 1 份）：已删。
- 对 `dev.runyard.spike.k3` 执行了 `tccutil reset All`。
- 没有写 `/Applications`、`/usr/local/bin`，没有登录项、启动代理。`~/.runyard`、`~/Runyard` 实验前后都不存在。
- 留下的：`~/Library/Caches/electron` 里的三个 Electron zip。
- **可能留在屏幕上的**：见“做实验时踩到的事”第 1 条。如果负责人屏幕上有一个“RunyardK3 想访问桌面文件夹”的对话框，点“不允许”即可，对应的应用已经删除。我看不到屏幕，不能确认它出现过，也没有去点它。

CI Windows（第 4 轮）：安装前后的快照逐项相同（用户 PATH 及其类型、链接协议、卸载条目、`HKCU\Software` 下的 GUID 项、`Programs` 目录、开始菜单、桌面、应用数据目录）；`RunyardK3.exe` 进程 0 个。

CI macOS（第 4 轮）：同本机各项；另外按专属路径结束了 1 个被 Gatekeeper 拦在 `AppTranslocation` 下的进程（带隔离标记 `open` 留下的，它没有运行我们的代码）。
