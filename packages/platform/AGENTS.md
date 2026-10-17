# @runyard/platform

## 用途

系统差异的唯一出口：`Platform` 接口、按系统分开的实现、路径与名称规则、契约测试（技术设计 §7.1，决策记录 0003、0013，`docs/architecture/platform-interface.md`）。
现状：接口已定全；`paths`、`ipc`、`exec`（`which`、`spawn`、`spawnDetached`）、`proc`、`ports`、`fs`、`watch` 有真实现（`darwin`、`linux`；`fs.trash` 只有 `darwin`，`linux` 抛 `NOT_SUPPORTED`）；其余各块是占位，抛 `INTERNAL`（“尚未实现”），随 #26 逐块换成真实现。第一版只做 macOS，`win32` 不写。

## 对外暴露什么

只从 `src/index.ts` 导出：`getPlatform()`、`platformFor()`、`Platform` 及其类型、`AbsPath` / `PosixRelPath` 与 `absPath` / `posixRelPath` / `joinPath`、`PlatformError` / `platformError`、`discoveryFilePath` / `supervisorLogPath` / `supervisorLogDir`（状态目录里发现文件和管理进程日志的位置：supervisor 写、client 读，所以放在这里，`src/state-files.ts`）。其他包只从 `@runyard/platform` 导入。
`getPlatform()` 是整个代码库唯一读取运行系统的地方；不支持的系统抛 `NOT_SUPPORTED`，不退到别的实现。测试用 `getPlatform({ home, arch, profile })` 或 `platformFor()` 指向临时目录。`home` 被换成数据根目录（命令行的 `--root`、管理进程的 `--home`）时，生产代码必须同时传 `shellHome` 为用户真实的主目录：登录 shell 以它为 HOME，才读得到真正的启动文件（nvm、gvm 等）；测试不传，登录 shell 就用 `home` 里合成的启动文件。

## 本包特有的规则

- 可以导入：`@runyard/protocol`（只用它的错误码）。依赖规则的唯一出处是 `tooling/checks/layers.json`；`layers` 检查只看 `package.json` 和 `tsconfig.json`，不扫源码，源码里导入了没声明的包由 `tsc -b` 拦住。不放原生模块，不导入 Electron。
- 接口不假设 POSIX：不出现信号、进程组；进程身份是 pid 加启动时间（`ProcRef`）；`proc.terminate` 核对身份，对不上就什么也不做；`fs.trash` 可以失败，绝不退到永久删除；`ipc.endpoint()` 是不透明字符串；锁住的路径是 `PATH_LOCKED`。
- 路径用 `AbsPath` / `PosixRelPath`，用 `node:path` 拼，不手写分隔符；相对路径永远用 `/`。
- 错误是 `PlatformError`（携带协议的代码加参数加英文 `debug`），不产生给人看的句子。系统“不支持”用 `NOT_SUPPORTED`，“还没写”的占位用 `INTERNAL`。
- 名称校验在所有系统一致（保留名、末尾的点和空格），不要按系统放宽。
- 实现之间不互相引用；共用部分在 `posix/`，`darwin/` 和 `linux/` 只组合它并写自己的差别。不写 `win32/`，也不加任何只属于 Windows 的代码。
- 给 `Platform` 加成员，必须同时在 `src/contract/` 加契约用例（`platform-contract` 检查）；`platform.ts` 的写法（分组用内联对象类型、每个成员单独声明）是那个检查的解析依据。
- `ipc`：连接点是状态目录下 `run/supervisor.sock`（路径上限 darwin 104、linux 108 字节，超了 `PATH_TOO_LONG`）。`listen()` 先拿内核锁再删残留的 socket 文件并监听（darwin：`run/supervisor.lock` 上的 `O_EXLOCK`；linux：抽象 socket），别的进程持锁抛 `BUSY`；`connect()` 连不上一律 `SUPERVISOR_UNAVAILABLE`；`computeProof` / `verifyProof` 是握手的 HMAC（verify 常量时间）。算法与实测见决策记录 0005 和它的证据文件，不要改成“只靠监听失败”。
- `exec.spawnDetached`：detached、不继承标准输入输出（输出追加到日志文件）、工作目录是状态目录、环境原样用调用方给的；接口没有选择启动方式的选项（决策记录 0013：接口里不出现只属于某个系统的概念）；“调用者在关闭即杀的作业里也要活下来”就是 `spawnDetached` 本身的含义，以后的 Windows 实现自己决定怎样做到（Job Object 与 WMI 的证据见 0005 的证据文件和 0013 的清单）。
- 契约测试通过 `@runyard/platform/contract` 导出给 `@runyard/testing`，假平台跑同一组用例；`ContractContext.complete` 为 true 的实现（假平台）不跑占位那一组。
- 进程与端口（`posix/posix-proc.ts`、`posix-exec.ts`、`posix-ports.ts`，算法出自决策记录 0006）：`spawn` 参数数组不经 shell、`detached` 自成进程组、去掉 `ELECTRON_RUN_AS_NODE`；`terminate` 整组发信号、等 `graceMs`、再整组强制结束，**每次发信号前都重新核对身份**（根进程在则 pid 加启动时间必须一致且它是组长；根进程已死则组里不能有比它更早启动的成员）；pid 0、1、负数、本进程和本进程所在的组一律不碰。不要加“只凭 pid 或进程名”的路径。
- `proc.findByMarker({ name, value })`（规格 RUN-LIFECYCLE-20）：找环境里带 `name=value` 的活进程（含脱离进程组的），返回 `ProcRef[]`，不含本进程和 pid 0、1。macOS 读 `ps eww -U <uid>` 的输出（环境接在命令后面，按整词匹配；整张表约 60 到 120 毫秒），Apple 自带的受保护程序读不到环境所以找不到；Linux 读 `/proc/<pid>/environ`（精确）。找不到不等于没有。`terminate` 的规则不变：只有组长才整组停，所以对结果逐个 `terminate` 时，非组长的杂散进程由它所在组的组长带走。
- 进程表和连接表怎么读是各系统的事（`ProcessSource`、`SocketTable`）：macOS 用 `ps`、`netstat -anv`（`darwin/`），Linux 读 `/proc`（`linux/`），算法共用。macOS 上 `127.0.0.1` 绑得上并不代表端口空闲（别的程序监听 `0.0.0.0` 时照样绑得上），所以 `ports.isFree` 绑完还要看连接表。
- `fs`（`posix/fs/`，算法出自决策记录 0010）：除 `trash` 外 darwin 与 linux 共用。`readText`（不存在或不是文件返回 `null`）、`readBytes`（同 `readText` 但返回原样字节，模板另存要逐字节保留图片）、`readHead`（只读开头几个字节，认可执行文件的芯片架构用）、`listDirs`（只列下一层子目录、排序、不存在返回 `[]`）、`listFiles`（只列下一层普通文件，不含子目录和符号链接，排序，不存在返回 `[]`）、`exists`、`makeDir`（递归）、`writeFile`（父目录必须已在，覆盖）、`appendFile`（接在末尾，文件不存在就建，父目录必须已在）、`removeFile`（只删单个普通文件，不存在不报错，目录和链接抛 `INTERNAL`；管理进程的运行日志与轮转文件用，用户的项目只能 `trash`）、`renameFile`、`moveDir`、`writeAtomic`。系统错误码统一经 `map-fs-error.ts`：`EBUSY`/`EPERM`/`EACCES` 是 `PATH_LOCKED`，`ENAMETOOLONG` 是 `PATH_TOO_LONG`，其余是 `INTERNAL`（系统码只进 `debug`）。
- `moveDir` / `renameFile` 绝不覆盖已有的名字：POSIX 的 `rename` 会静默盖掉同名的空目录或文件，所以先占位（目录 `mkdir`、文件独占创建）再改名，目标已在抛 `NAME_EXISTS`；只改大小写（同一个条目）直接改名；只做同卷改名，跨卷（`EXDEV`）就是错误，**不退到复制再删除**；移进自己里面拒绝。
- `writeAtomic(file, data, { private? })`：同目录临时文件（`.<名>.<随机>.tmp`，`wx` 创建时就带最终权限）、刷盘、改名盖掉目标；任何一步出错清掉临时文件，旧文件完好。`private: true` 是 0600（口令、私有状态）；缺省沿用已有文件的权限，新文件 0644 再受 umask 收窄。进程在改名前被杀会留下 `.tmp` 残片，清理不在这里。
- `fs.trash`（`darwin/trash/`，只有 darwin）：条目不存在 `FOLDER_MISSING`；顺序是 ①`/usr/bin/trash`（参数数组、不经 shell；保留“放回原处”，结果 `restorable: true`；**只在平台的主目录就是账号真实主目录时用**，因为它只会进真实的废纸篓，测试用的临时主目录不会碰它）②卷上的废纸篓目录（同卷 `~/.Trash`，别的卷 `<挂载点>/.Trashes/<uid>`，模式 1333 和 0700）里先占位再改名，重名换 `名字 时.分.秒`、`名字 时.分.秒 2`……，**不列废纸篓目录**（会被隐私保护拒绝）、**不对已有名字直接改名**（K9 发现的数据丢失缺陷）③卷上没有废纸篓目录或改名跨了卷：复制到 `~/.Trash` 下的临时副本、逐项核对（种类、权限、大小、内容摘要、链接目标）、改成最终名字，之后才删原件（`remove-after-verified-copy.ts`，**整个平台层唯一删除原件的地方**，`no-permanent-delete` 检查只放行这一个文件里的递归删除）。任何一步失败：原件保留、半成品清掉、`TRASH_UNAVAILABLE`；只读目录（如 Go 的模块缓存）在确定要删之前才放开写权限。不用 `osascript`。后两条路径 `restorable: false`。外部依赖（复制、改名、系统命令）可注入（`trash-deps.ts`），测试靠它造故障。
- `watch`（`posix/fs/posix-watch.ts`）：chokidar 5（纯 JS，间接依赖 `readdirp`），事件攒 30 毫秒成批；`ignore` 按相对路径，`depth: 1` 只看根的直接子项；`dispose` 返回时底层句柄已交还（chokidar 的 `close()` 返回后 libuv 还要约 1 毫秒才关完，所以多等 10 毫秒），之后不再回调。监听出错接口里没有出口，被吞掉，靠资源库扫描兜底。
- `paths.maxPathLength` 是整条路径的字节上限（macOS 1024、Linux 4096），`checkLength` 以它为界；要在提示里给用户看数字时用它，不要从装配方传。
- 实现一块占位时：在 `posix/` 或 `darwin/` 写真实现，换掉 `posix/pending-areas.ts` 里对应的占位，再把 `contract/pending.contract.ts` 里对应的行换成真用例。

- `system.release()`：操作系统版本串（`os.release()`），只给 `doctor` 的诊断信息。

- 登录环境（`posix/env/`，决策记录 0009 与证据文件，不要绕开其中任何一条陷阱的对策）：`env.load` 先学登录 shell（`os.userInfo`，再 `dscl` / `getent`，最后 `SHELL`，不依赖 `SHELL`），zsh、bash、fish 之外的 shell 不尝试直接回退；按“`-l -i -c` → 命令写 stdin → 只用内建打印 PATH → `-l -c`（降级）”依次试，整条链共用 10 秒硬期限（`ENV_RESOLVE_TIMEOUT_MS`），超时立刻结束整组（经 `proc.terminate`，核对身份）；标记在脚本里拆开写，文本里不含完整标记；只取第一对标记之间的字节。结果带 `source`，失败带 `reason`，只给代码不给句子。
- 缓存归平台层（`env-cache.ts`）：键 = 登录 shell + 启动文件 mtime 指纹（有版本文件的项目再加项目路径和这些文件的 mtime，并以项目文件夹为工作目录捕获，否则用主目录共用全局项），成功 1 小时、失败 1 分钟；过期时返回旧值并在后台刷新，`refreshing` 是刷新完成的承诺；第一次就失败会自动在后台重试一次（`refresh: true` 不自动重试）。`toolchain.changed` 事件、工具检测结果的缓存、版本范围判定归 core（#34）。
- `tools.candidates` 只找文件，不执行；版本命令由调用方经 `exec.spawn` 执行，命令（Go 是 `go version`）来自工具定义，平台层不放工具表。`shell.interactive` 现在只供以后的集成终端用。fish 的脚本只有单元测试，没有在真实 fish 上跑过。

## 子目录地图

- `src/platform.ts`：`Platform` 接口和它的类型；`src/get-platform.ts`：`getPlatform()`
- `src/path-types.ts`、`src/platform-error.ts`、`src/platform-options.ts`
- `src/paths/`：名称校验（各系统一致的纯函数）
- `src/posix/`：darwin 与 linux 共用的部分：长度检查、`fs/`（文件操作、先占位再改名、原子写、`watch`）、网盘与用户文件夹的判断（POSIX 路径，用 `node:path/posix`，任何系统上结果一样）、`ipc/`（连接点、两种内核锁、监听、连接、握手证明）、`spawn-detached.ts`、`posix-exec.ts` / `posix-proc.ts` / `posix-ports.ts`（`ProcessSource`、`SocketTable` 是各系统读进程表和连接表的接口）、占位；`src/darwin/`（`ps`、`netstat`、`trash/`）、`src/linux/`（`/proc`）：各系统的组合
- `src/contract/`：契约测试，同一组用例对每个实现各跑一遍；真 socket、内核锁、脱钩进程、起真进程树和绑真端口的用例（`exec-process`、`proc`、`ports`）只对“本机会选的实现”跑（`ContractContext.native`），其余实现跑与系统无关的用例；假程序在 `fixtures/fake-service.ts`，起的进程一律记账（`process-ledger.ts`），teardown 核对无遗留
- `src/test-support/`：合成主目录和合成环境矩阵（`synthetic-home.ts`、`env-cases.ts`，假的版本管理器，全在临时目录）、`toolchain-harness.ts`（真 shell 加记账的 exec）、废纸篓与改名测试的沙盒（`trash-sandbox.ts`：每个测试自己的临时根目录，所有改名、移动、删除之前断言目标在根目录内）、测试用的小进程（抢锁的启动者、脱钩的启动者）、握手对话的最小替身、临时主目录、按 pid 加启动时间收尾的进程登记（并同时登记到进程测试阶段的遗留进程守卫，`spawned-registry.ts`）；不是产品代码，不从入口导出
- `vitest.config.ts`：继承 `tooling/vitest/base.ts`，不要在这里改测试规则

## 测试

```sh
pnpm test --filter @runyard/platform
```

不需要平台实现的测试照常命名；需要的，文件名以 `.platform-dependent.test.ts` 结尾，Windows 任务不跑它（唯一的跳过机制，见 `docs/guides/testing.md`）。契约测试就是这一类。测试里不写系统判断。
废纸篓测试只在 `trash-sandbox.ts` 的沙盒里做（假主目录下的 `.Trash`）。唯一往真实 `~/.Trash` 放东西的是 `trash-system-and-volume.platform-dependent.test.ts` 里验证 `/usr/bin/trash` 的那一条：名字带 `runyard-test-<随机>` 前缀，测完只按这个名字逐项清掉并用 `stat` 确认（废纸篓不能列目录），绝不清空废纸篓。别的卷用 `hdiutil` 造 30 MB 的 APFS 磁盘映像（macOS 才注册，约 1.5 秒一次）。Finder 里“放回原处”无法自动断言，由负责人在自己的 Mac 上看一次（证据文件 0010 第 10 节）。
起进程、绑 socket 的测试用 `test-support/temp-home.ts` 的短前缀临时目录（socket 路径有 104 字节上限），每个进程登记 pid 加启动时间，收尾时核对后结束（`tracked-processes.ts`）。
