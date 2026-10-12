# 平台层：接口、各系统的差别、契约测试

系统差异的唯一出口。`@runyard/platform` 是一个接口加按系统分开的实现，业务代码只调用接口（决策记录 [0003](decisions/0003-platform-layer.md)、[0013](decisions/0013-macos-only-v1.md)）。第一版只写 `darwin` 实现和薄的 `linux` 实现，`win32` 以后再写；接口依据已实测的 Windows 行为设计，不假定 POSIX：接口里没有信号和进程组（进程身份 = pid + 启动时间），有 `PATH_LOCKED` 一类的错误码，`fs.trash` 可以失败而不是永久删除，连接点是不透明的地址。算法不在这里重复，指向决策记录和证据文件。接口的唯一出处是包的入口导出（`packages/platform/src/platform.ts`）和契约测试；本篇解释各系统的差别。接口已定全，实现按块随 #25 到 #28 落地，没落地的块是占位（`exec.which`、`exec.spawn`、`proc`、`ports` 已落地）。

出处：技术设计 §3.2、§7.1、§7.2、§4.5、§4.8；决策记录 [0005](decisions/0005-supervisor-singleton-handshake.md)、[0006](decisions/0006-stop-process-tree.md)、[0009](decisions/0009-toolchain-resolution-macos.md)、[0010](decisions/0010-trash-and-delete.md)、[0013](decisions/0013-macos-only-v1.md)。

## 1. 计划中的文件

```
packages/platform/src/index.ts           Platform 接口、getPlatform()、AbsPath / PosixRelPath
packages/platform/src/darwin/            macOS 实现
packages/platform/src/win32/             以后，v1 不写（Windows 实现；bin/ 放随包的 runyard-helper.exe，暂定名）
packages/platform/src/linux/             薄实现：只组合 posix/，三组抛 NOT_SUPPORTED
packages/platform/src/posix/             darwin 与 linux 共用的部分
packages/platform/src/contract.test.ts   同一组契约测试，对每个已有的实现（darwin、linux）各跑一遍；以后加 win32 时同一组测试直接对它跑
```

规则：`getPlatform()` 是整个代码库唯一读 `process.platform` 的地方；平台实现之间不互相引用；`AbsPath`（本机格式绝对路径）和 `PosixRelPath`（永远用 `/` 的相对路径）是带标记的类型，普通字符串传不进去；文件和消息里的相对路径都用 `/`。`platform-contract` 检查（M1 加入）解析 `Platform` 的成员列表，核对契约测试里每个成员至少出现一次。

## 2. 方法清单与各系统差别

| 成员 | 方法 | macOS | Windows：以后（依据决策记录中的实测） | Linux（薄） |
| --- | --- | --- | --- | --- |
| `id` `arch` `caps` | 只读属性；`caps`：`gracefulStop`（`graceful` 或 `none`，不写信号）、`cloneCopy`、`symlinks`、`sandbox` | `graceful` | `none` | 同 macOS |
| `paths` | `home` `stateDir` `defaultLibrary`；`validateName(name)`；`checkLength(p)`（`ok` `near-limit` `too-long`）；是否在网盘同步目录下；是否在桌面、文档、下载里（macOS，选资源库位置时警告） | 路径很宽；socket 路径超 104 字节报错 | 默认 260 字符上限，保守取 248 判断；保留设备名。名称校验**所有系统一致**：保留名和末尾的点、空格都拒绝 | 同 macOS，socket 上限 108 |
| `env` | `load({ refresh?, cwd? })` 返回 `{ env, source, ms }`；`runDefaults()` | 向登录 shell 要环境，登录加交互，`env -0`，10 秒硬超时，缓存与后台刷新，见 0009 | 进程本来就继承完整环境；“重新检测”时从注册表重读，不要求重启 | 同 macOS |
| `exec` | `which(name, env, cwd)`；`spawn({ argv, cwd, env, stdin })` 返回 `ManagedProcess`；`spawnDetached(argv, opts)` | 直接启动；子进程环境去掉 `ELECTRON_RUN_AS_NODE` | `.cmd` 垫片包一层 `cmd.exe` 并按两层规则转义；一律 `windowsHide`；`spawnDetached` 的 `via: 'wmi'` 在启动者放进“关闭即杀”的 Job 时用（0005） | 同 macOS |
| `proc` | `terminate(p, { mode, graceMs })`；`members(p)`（测试断言无残留）；`identity(pid)` 返回启动时间 | 进程组整组发信号，见 0006 | 核对 pid 和创建时间，再 `taskkill /T /F`，见 0006；**结束任何进程之前必须核对两者** | 同 macOS |
| `ports` | `isFree(port)` 返回 `free` `in-use` `reserved`；`occupant(port)`；`connections(port)`；`loopbackOnly(port)` | 只试 `127.0.0.1` 和 `::1`，再看连接表（macOS 上别的程序监听 `0.0.0.0` 时 `127.0.0.1` 仍绑得上，实测）；连接表和占用者靠 `netstat -anv -p tcp`（不用 lsof），查不到占用者返回 `null` | 绑定报无权限返回 `reserved`；占用者靠 `netstat`（推） | 同 macOS |
| `fs` | `moveDir(from, to)`；`trash(dir, { regenerable? })`；`writeAtomic(file, data)` | `trash` 优先 `/usr/bin/trash`，否则占位再改名，见 0010；不用 `osascript` | `trash` 用随包小工具加预检，依赖目录（`regenerable`）直接删、其余进回收站，放不进就失败、绝不永久删除；`moveDir` 失败码 `EBUSY` `EPERM` `EACCES` 归为 `PATH_LOCKED` | `trash` 抛 `NOT_SUPPORTED` |
| `watch` | `watch(root, opts, cb)`，返回可释放的句柄 | 文件系统事件 | `dispose` 后句柄必须已释放，否则改名删除会被占用 | 同 macOS |
| `ipc` | `endpoint()`；`listen()`；`connect(timeoutMs)` | `listen()` 先拿 `run/supervisor.lock` 内核锁再监听 | 命名管道，管道本身就是锁 | 抽象命名空间 socket 作锁 |
| `tools` | `candidates(tool, env)`；`packageManagers()` | 常见安装目录作解析失败时的临时答案 | 除 `PATH` 外查固定位置和注册表；商店占位 `python.exe` 判未安装 | 同 macOS |
| `shell` | `interactive(env)`，第一个是默认 | 登录 shell | PowerShell 等 | 同 macOS |
| `desktop` | `reveal` `openTerminalAt` `openInEditor` | 实现 | 实现 | 抛 `NOT_SUPPORTED` |
| `cli` | `installShim(source)` | 在用户 bin 建符号链接 | 改注册表用户 `Path`（M2 后期，随桌面应用） | 抛 `NOT_SUPPORTED` |

M1 必须实现的成员：除 `desktop`、`cli.installShim` 以外的全部（它们属于桌面应用），只写 `darwin` 和薄 `linux`。Windows 一列整体推迟，不在 v1 实现；其中 `fs.trash` 的 Windows 实现依赖随包小工具，做 Windows 时再做（0010、0013）。接口里 `ProcRef` 的身份只含 pid 和启动时间。

## 3. 已定的算法（按决策记录，不重复）

| 主题 | 去哪里看 |
| --- | --- |
| 单实例：内核锁加监听 | 0005 与 [证据](evidence/0005-supervisor-singleton-handshake.md) |
| 防冒充握手、启动者拉起管理进程 | 同上 |
| 停止整棵进程树、Windows 的 pid 加创建时间核对、运行标记、`GOTMPDIR` | 0006 与 [证据](evidence/0006-stop-process-tree.md) |
| 日志的切行与解码（读取时清洗在 core） | 0008 与 [证据](evidence/0008-log-capture-and-cleaning.md) |
| 登录 shell 解析工具环境 | 0009 与 [证据](evidence/0009-toolchain-resolution-macos.md) |
| 移到废纸篓、回收站，改名与锁，名称校验 | 0010 与 [证据](evidence/0010-trash-and-delete.md) |

## 4. 契约测试与测试替身

- 同一组测试对每个已有的实现各跑一遍，在 macOS 和 Ubuntu 的 CI 上运行；Windows 的 CI 任务只跑与系统无关的代码，需要平台实现的测试（包括这组契约测试）在 Windows 上通过唯一一套文档化的机制（标记 `platform-dependent`，文件名后缀 `.platform-dependent.test.ts`，见 `docs/guides/testing.md`）跳过，测试里不写 `process.platform` 判断。Linux 上标“不支持”的三组（`fs.trash`、`desktop`、`cli.installShim`）允许跳过，其余必须过。
- 核心的单元测试用 `@runyard/testing` 里的假平台（内存实现、假时钟、假进程），与系统无关（技术设计 §3.2）。
- 测试不读写真实的 `~/Runyard` 和 `~/.runyard`；回收站与废纸篓的测试只在临时目录里做。
- 结束进程的任何测试都要核对启动时间，避免重演 K2 的事故（0006：Windows 上按 pid 误杀了系统进程）。

## 进程身份与停止的实现要点（#25）

- 启动时间怎么读（不用原生模块）：macOS 用 `ps -o lstart=`（`TZ=UTC`、`LC_ALL=C`），单个进程约 3 毫秒，整张进程表 `ps -A` 约 20 毫秒（约一千个进程），精度是秒；Linux 读 `/proc/<pid>/stat` 第 22 项，不起子进程，精度 10 毫秒，起点是开机时刻。所以 `ProcRef.startTime` 只能比较相等或先后，不是墙上时间。
- `exec.spawn` 同步返回 `ref`，所以起进程后同步读一次启动时间（macOS 约 3 毫秒的阻塞）。读不到说明进程已经退出，用 0 占位。
- `proc.terminate`：整组发信号，每 10 毫秒看一次组空了没有，`graceMs` 用完再整组强制结束（发之前重新核对身份），强制结束后最多再等 5 秒，组还不空就抛 `INTERNAL`。根进程先退出、后代还在时仍然整组停止（组号不会在组还有成员时被复用；另要求组员的启动时间不早于根进程）。
- 不在平台层的：端口重绑复查（要知道端口，属于运行引擎）；脱离进程组的后代（Next 的遥测进程、`setsid` 的孙进程）靠运行标记全机查找；`GOTMPDIR` 的设置与删除。接口里还没有“按运行标记找进程”这一项，做的时候再加。

## 未定

1. 已定的字段在 `platform.ts` 里：`ProcRef`（pid 加启动时间，毫秒）、`ManagedProcess`、`ExitInfo`（只有退出码，没有信号）、`TrashResult`、`WatchOptions`、`NameProblem`（代码，不是句子）、`ToolCandidate`、`ShellInfo`。随各块实现再调整时，同时改契约测试。
2. 最初方案还有 `exec.resolve`、`exec.tokenize`、`ports.nextFree` / `waitReleased`、`fs.copyTree` / `removeTree` / `lockers`、`tools.isStub` 等；设计 §7.1 合并时没有保留。哪些需要，实现时再决定。
3. 伪终端不在平台层：node-pty 只在桌面应用的终端进程里（设计 §3.2 规则 6），最初方案里平台层的 `pty` 一组不做。
4. Linux 上占用者查询已用 `/proc/net/tcp` 加 `/proc/<pid>/fd` 实现（别的用户的进程读不到，返回 `null`）；Linux 上 `isFree` 对小于 1024 的端口的处理仍未定。
5. 找文件夹占用者（`fs.lockers`）要不要进接口：0010 说靠读进程当前目录和命令行匹配，覆盖不全。
6. Windows 的 `moveDir` 要不要退避重试（0010：停掉 Vite 后 30/30 成功，是否需要等真机有杀毒时复核）。
