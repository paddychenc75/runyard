# @runyard/core

## 用途

工具检测、运行引擎、资源库、模板、自动清理的判断（技术设计 §3.2）。运行引擎不知道“标签页”和“命令行”是什么，持有者只是 `supervisor` 里的概念。
现状：日志的切行、解码和读取时清洗（`src/logs/`），一次运行的状态机和进程生命周期（`src/run/`），资源库里的项目创建、命名、索引和“文件夹被动过”的判断（`src/library/`），工具链检测（`src/toolchain/`），以及模板的 lint、工具定义的读取、经平台层读模板文件夹、另存为模板（`src/templates/`），端口的分配与回退（`src/ports/`），启动前的准备：依赖安装、环境、启动计划（`src/prepare/`），脚本的语法检查与监听重跑（`src/scripts/`）。其他模块由后续 issue 各自加入。

## 对外暴露什么

只从 `src/index.ts` 导出（`exports` 只有 `.`），其他包只从 `@runyard/core` 导入。
- `createLineSplitter({ stream, now })`：每一路输出（stdout、stderr）一个。`push(字节块)` 返回凑齐的整行 `LogEntry`，半行留到下一块；`end()` 在进程结束时交出没有换行的残行。只按 0x0A 切，行里的 CR、颜色码、字节序标记原样保留。
- `decodeLogLine(字节)`：先严格 UTF-8，失败再 GB18030；不吞字节序标记。
- `cleanLogText(文本)`：读取时的九条清洗规则，纯控制序列的行返回 `null`（丢弃）；幂等。
- `cleanLogEntries(条目们)`：对 stdout、stderr 条目清洗并丢掉空结果，命令和系统条目原样保留。
- `RunEngine`（`src/run/`）：`start(request)` 返回 `{ run, snapshot }`，对活动中的项目再启动返回同一个运行并在快照上带 `alreadyRunning`；`get`、`current`、`list`、`runningCount`、`restart(runId)`、`stopAll({ mine })`。`Run`：`snapshot`、`error`（failed 的错误码与现场，errored 的 `SCRIPT_ERRORED`）、`isSlow`（同时快照上带可选的 `slow: true`）、`waitFor(states)`、`stop`、`setOwner`、`writeStdin(data)`（原样写入标准输入，返回 `written`/`closed`/`unsupported`，规格 RUN-SCRIPTS-22 到 25）、`beginReload`/`endReload`。
- 启动前的准备（`src/prepare/`）：`createRunPreparer({ platform, clock, toolchain, resolve, definitions, portRange?, network?, serveStatic? })` 返回 `RunPreparer`（交给 `RunEngine` 的 `preparer`）加 `installHintFor(request, failure)`。`resolve(request)` 由装配方（supervisor）实现，返回 `RunSubject`：项目文件夹、运行器、`requires`、登记的端口、别的项目登记的端口、包管理器。顺序：工具检查（不通过就失败，不安装任何东西）→ 依赖安装（`installDependencies`：`inputs` 加包管理器的哈希与 `stamp` 比对，没变就跳过且不进入 `installing`；失败按 `setup.errors` 归类为 `DEPS_OFFLINE` / `RUNTIME_MISSING` / `SETUP_FAILED`；pnpm 没有终端时报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，带 `--config.confirmModulesPurge=false` 重试一次，不设 `CI`，TEMPLATES-RUNNERS-16）→ 端口 → 环境 → 启动计划（`ready`、`slowAfterMs`、Go 的 `GOTMPDIR`）。没有 pnpm 回退 npm 时发 `PACKAGE_MANAGER_FALLBACK`。
- 端口（`src/ports/`）：`createPortSlotAllocator`（给资源库的 `PortSlotAllocator`：范围内没登记过的最小端口，脚本返回 null，范围用完抛错）、`chooseRunPort`（先试想要的端口，被占用或保留就往后找既空闲又没登记给别人的，回退只对这一次有效，调用方不得写回登记；`explicit: true`（用户用 `--port` 指定的）用不上就返回 `{ refused }`，准备阶段据此报 `PORT_IN_USE`，不回退，RUN-PORTS-15）、`DEFAULT_PORT_RANGE`（7100 到 7999）。
- 环境与探测：`buildRunEnv`（登录环境为底，叠 `runDefaults()`、统一固定项、镜像与代理、`PORT`、运行器 env，最后删 `ELECTRON_RUN_AS_NODE`；不设 `CI`）、`createReadinessProbe({ clock, io? })`（`http` 任何低于 500 的响应、`port` 连得上、`log` 出现匹配行；直连 `127.0.0.1`，不读代理）。
- 安装提示：`selectInstallHint` / `detectInstallContext`（`src/toolchain/install-hint.ts`）。有 nvm 给 nvm 的命令，只有 Homebrew 给 brew 的命令，都没有只给链接；模板自己写的 `install` 排在前面，链接始终给。只产出数据，从不执行（TEMPLATES-FORMAT-35、36）。
- 脚本（`src/scripts/`）：`new ScriptRuns({ platform, clock, engine, toolchain, resolve, autoRunEnabled })`。`start(request)` 是手动运行（声明了 `check` 就先检查，不通过不运行，返回 `{ ok: false, error: SCRIPT_ERRORED }`；对活动中的脚本返回现有运行）；`watch(request)` 按运行器的 `watch.mode` 监听文件：`rerun` 先过 `check`，通过才先停旧的再起新的，不通过把上一次的运行标 `stale`（`Run.markStale`）；`restart`（服务）调 `Run.reload()`。`watch.paths` / `ignore` 用简化通配（`watch-glob.ts`），窗口内连续变化只触发一次。
- `canTransition`、`allowedTransitions`、`activeStates`、`isActiveState`、`IllegalTransitionError`：转移表（按运行种类）和“N 个运行中”的活动状态集合。
- `expandCommand`（运行器命令占位符，参数数组，不经 shell）、`childEnv`（去掉 `ELECTRON_RUN_AS_NODE`、放运行标记 `RUNYARD_RUN_ID`）、`stopProcessTree`。
- `PlaygroundLibrary`（`src/library/`）：`open(deps)` 读 `state/library.json`，不存在或坏了（坏文件改名留存）就从磁盘重建；`list`、`find(id、名称或文件夹的绝对路径)`、`requireFolder`（找不到文件夹报 `FOLDER_MISSING`）、`create(seed, request)`（默认名“模板标识加序号”、`ifExists: reuse | fail`、`PATH_NEAR_LIMIT` 提示放在结果的 `notices`）、`rescan()`（返回 `ScanReport`：`added`、`changed`、`missing`、`copied` 和 `skipped`，由 supervisor 发 `playground.*` 事件）、`relocate`、`update(ref, { note?, scriptAutoRun?, lastRequest?, requestAutoResend? })`（只写项目文件夹里的 `playground.json`；`lastRequest` 是请求面板上一次发出的请求，`requestAutoResend` 是它的自动重发开关；同一个项目的 update 在本进程内排队执行，不会互相覆盖字段）。错误是 `LibraryError`（`error` 里是协议的 `RunyardError`），更新版本写的 `library.json` 或 `playground.json` 只读不写（`DATA_FROM_NEWER_VERSION`）。
- `ToolchainService`（`src/toolchain/`）：`check({ requires, cwd?, cachedOnly? })` 返回 `ToolchainResult`（`tools: ToolCheck[]`、`errors`（`TOOL_MISSING` / `TOOL_TOO_OLD`，空表示可以运行）、`notices`（`ENV_UNRESOLVED`、`ENV_DEGRADED`、`TOOL_VERSION_UNTESTED`、`PACKAGE_MANAGER_FALLBACK`）、`fallbacks`、`envSource`）；`TOOL_MISSING` / `TOOL_TOO_OLD` 的参数、以及缺少或过旧的 `ToolCheck`，带 `installCommand`（参数连成一行）和 `installUrl`（`install-hint-params.ts`，只展示不执行）：项目自己 `requires.<工具>.install` 的优先，否则取工具定义里当前系统的 Homebrew 命令和官网（#228，TEMPLATES-CUSTOM-21）；找到的工具带 `arch`（`binary-arch.ts` 读可执行文件开头的 Mach-O 头，经平台层 `fs.readHead`，读不出来不写）；`verifyPath(tool, path)` 只试一个手动指定的文件，读得出版本号才算数；`doctor(cwd?)`、`recheck(cwd?)`（清缓存、`env.load({ refresh: true })`、重新检测）、`warmUp(cwd?)`（应用启动时后台刷新，完成后 `onChanged`）、`snapshot()`（`ToolchainFile`，由 supervisor 写 `state/toolchain.json`）、`isCacheFresh(cwd?)`。构造参数 `ToolchainServiceDeps`：平台、时钟、`definitions`（工具定义表）、`toolPaths()`（设置里的手动路径）、`onChanged`（发 `toolchain.changed`）、`initialCache`、`onCacheChange`。
- 静态页面服务（`src/static/`）：公开 `createStaticServer` 和 SSE 路径 `RELOAD_EVENTS_PATH`，只绑定本机回环地址；路径与符号链接防护、实时读取、文件变化刷新及释放行为不变，由管理进程或命令行装配。
- 模板展开（`src/templates/template-catalog.ts`）：`createTemplateCatalog` / `TemplateCatalog`，校验模板和变量、生成 `PlaygroundSeed`；仅经平台读文件，错误为 `LibraryError`，协议代码与参数保持不变。
- 模板（`src/templates/`，纯函数，文件由调用方读好交进来）：`lintTemplate({ folder, builtin, runners, knownTools, fallbackName })` 返回 `LintResult`，运行器的问题路径以 `runner.` 开头；`parseToolDefinitions(sources)` 把 `templates/tools/*.json` 读成 `{ definitions, problems }`，`definitions` 原样交给 `ToolchainService`。
- 模板的磁盘读写（`src/templates/`，只经 `platform.fs`，不用 `node:fs`）：`TemplateLocations`（内置模板、运行器、工具定义、用户模板四个目录，由调用方给）；`locateTemplate(platform, locations, ref)`（标识先找内置再找用户，绝对路径就是那个文件夹）；`lintTemplateRef`（定位、读运行器和工具定义、跑 `lintTemplate`，再补放在模板目录里才有的规则：文件夹名等于 id、用户模板不许占用内置标识 `template-id-reserved`；模板自带的 `runner.json` 不读）；`readTemplateFolder`、`listFolderFiles`、`decodeText`、`readToolDefinitions`；`saveTemplate(platform, input)`：把项目另存为用户模板（规格 TEMPLATES-CUSTOM-01 到 16），先把内容全读进内存、写临时目录 `.saving-<id>-<随机>` 再 `moveDir`（不覆盖已有名字），失败时临时目录进废纸篓、不留在模板目录下。`include` / `exclude` 路径由调用方用协议的 `relativePathSchema` 校验过。默认排除：`.runyard/`（只在根，include 也加不进来）、`node_modules` `.venv` `.git` `__pycache__`（任何深度）、`dist` `build` `.next` `.nuxt` `.output`（只看项目根）、`.env` 和 `.env.*`。管理进程的 `template.list|get|save` 用的就是这套读取和 `saveTemplate`（#119）。标识不合法、被占用的错误带 `kind: "template"`（`NAME_INVALID`、`NAME_EXISTS` 的可选参数，缺省是项目），文案据此写“模板标识”。
- 工具链的纯函数：`detectTool`、`extractVersion`、`evaluateRequirements`（对照 `requires` 出错误与提示，可单独用）、`toolsToDetect`、`judgeVersion` / `parseVersionNumbers`（范围比较只比范围里写了的几段）。
- 创建副本（`src/library/duplicate-playground.ts`，#182）：`library.duplicate(ref, { name? })` 照抄文件夹内容但不抄 `node_modules`，新 id、新端口，名称缺省按“模板标识加序号”，备注、自动清理沿用，创建者记为用户，不运行；失败的半成品只进废纸篓。
- 改名、移到废纸篓、自动清理（`src/library/`，#38）：`library.rename(ref, newName, { isBusy, beforeMove })` 与 `library.trash(ref, { beforeMove, regenerable? })` 只做技术设计 §4.3 固定顺序的第 5 步；停止、请客户端释放句柄、改名前在运行的项目改名后重新启动（持有者不变）由 supervisor 编排，经 `beforeMove` 接入。顺序是名称校验、`BUSY`、重名、`beforeMove`、平台层动作、改索引；平台层的错误码（`PATH_LOCKED`、`TRASH_UNAVAILABLE`、`NAME_EXISTS`、`FOLDER_MISSING`）原样抛出，失败时文件夹和索引都不动。`judgeAutoClean`（纯函数）与 `library.checkAutoClean(inUse)`（读设置、判断、把顺延记成 `snoozedUntil`）给出 `{ remind, clean, postponed, skipped? }`；`inUse` 是现在有运行的项目 id（开标签页即有运行，判断不认识标签页，规格措辞见 issue #73）。`readFile(item)`（读项目文件夹里的 `playground.json`，状态在返回值里）、`update(ref, { note, scriptAutoRun })`、`forget(ref)`（只从索引移除，下次扫描会重新登记那个文件夹），`setAutoClean(ref, days | null)`（从已保留打开时计时从现在起算）、`keep`、`ackReminder`、`markUsed`（记一次使用并清除提醒与顺延；只读命令和“打开但不运行”不调用）。
- `nextDefaultName`、`createUlid` / `randomUlid`（项目 id）。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`@runyard/platform`（依赖规则的唯一出处是 `tooling/checks/layers.json`）。不许导入 `i18n`，不产生给人看的句子。
- 日志里存未清洗的整行，清洗只在读取时做（决策记录 0008）；规则的全文在 `docs/architecture/evidence/0008-log-capture-and-cleaning.md` 6.2。改规则要先改规格。
- 类型环境只有 Node 类型，没有 DOM。
- 内存环形缓冲、日志文件、游标和 `logs` 方法属于 `supervisor`，不在本包。引擎只数自己发出的日志条数来填快照的 `cursor`。
- 运行引擎不读时钟和平台全局：平台、时钟（`RunClock`，结构类型，`FakeClock` 满足它）、事件出口都从 `RunEngineDeps` 注入。状态转移只经 `assertTransition`，非法转移是缺陷，抛 `IllegalTransitionError`。
- 在 `stopping` 时再启动：新建一次运行，它的准备阶段先等上一次停完（`RunSession` 的 `after`），不返回现有运行，也不会有两个进程同时在（负责人的决定，CLI-COMMANDS-78；RUN-LIFECYCLE-12 旧写法里对 `stopping` 返回现有运行的部分已被取代，议题 #73）。等待期间对新运行调 `stop()` 就不会起进程，命令行等不到停完时用它放弃（-79 的时限归命令行）。
- 重新加载与过期：`Run.reload()`（`watch.mode = restart`）在同一次运行里停掉进程、用同一个计划（同一个端口）再起、重新等就绪，期间 `reloading`；`Run.markStale(检查输出)` 不改状态，只给快照加 `stale`、把检查输出追加进这次运行的日志并发一条 `run.state`。新的运行的快照没有 `stale`。
- `RunSinks.port`：计划里有 `portFallback` 时发 `run.port`（规格 RUN-PORTS-06）。
- 停止：把运行器的 `mode` 和 `graceMs`（缺省 2000）原样交给 `platform.proc.terminate`（它负责核对 pid 加启动时间、礼貌请求、等满 `graceMs`、整树强制结束）；返回后引擎再核对 `members` 为空（否则整棵 `kill`），再按运行标记（`RUNYARD_RUN_ID`）找脱离进程组的后代，等它们自己走掉（上限 2 秒，到时还在就核对身份后结束；规格 RUN-LIFECYCLE-20），最后等端口在 3 秒内可绑定；等满 3 秒端口仍不可绑定时 `stop` 照常返回，日志里留一条 `PORT_NOT_RELEASED` 提示（端口、实际等的毫秒数、上限）。只等进程退出，不等输出管道关闭，退出后主动销毁管道。进程自己退出后树里留下的后代也一起结束。
- 四个接缝，别的 issue 在这里接上，不改引擎的类型：`RunPreparer`（checking 与 installing：工具检查、安装、端口、环境，返回 `RunPlan` 或 `RunyardError<FailureReason>`；#36 已用 `createRunPreparer` 接上）、`ReadinessProbe`（就绪探测；#36 已用 `createReadinessProbe` 接上，`ReadinessContext.onLine` 供 `ready.log` 订阅这次运行的日志）、`RunSinks`（`run.state`、日志、`run.exit`、较慢通知的出口；supervisor）、`Run.setOwner` 与 `StartRequest.owner`（持有者只是字段；#40）。`RunEngineDeps.removeDir` 用来删 Go 的单独临时目录。
- 资源库的接缝（类型在 `src/library/library-types.ts`）：读目录、读写文件、改名、原子写直接用平台接口 `platform.fs`（`readText`、`listDirs`、`exists`、`makeDir`、`writeFile`、`renameFile`、`writeAtomic`），没有另设存储接缝；`PortSlotAllocator`（新端口槽位，返回 `null` 表示没有端口，#36）、`PlaygroundSeed`（模板那一侧交来的“相对路径加内容”和写进元数据的几项，模板各 issue 接上）。路径长度上限直接取 `platform.paths.maxPathLength`，不再由装配方传。
- 资源库不做永久删除，也没有任何 `rm` 一类的帮助函数；创建中途失败的半成品只经平台层 `fs.trash`。
- 创建的顺序是规格要求的：先校验名称（不碰任何东西），再查重名和路径长度，写文件，最后写 `.runyard/playground.json` 和索引；没有元数据文件的文件夹会被扫描忽略。默认名的序号只看资源库根目录里现存的文件夹。

## 工具链检测的约定

- 只检测请求里 `requires`（加上 `fallback` 指向的工具）的工具，什么都不依赖的模板一个进程也不起（-01）。`cachedOnly` 只读缓存、不读环境、不起进程，过期的条目也照给（-18），缓存里没有的工具是 `unknown`，并按本次请求的范围重新判断缓存里的版本。
- 非 `cachedOnly` 的检测每次实时找、实时跑版本命令，不读工具缓存（-19）；缓存只写不读给 `cachedOnly` 用。键：项目里有版本文件（`.node-version`、`.nvmrc`、`.tool-versions`、`mise.toml`、`.python-version`、`package.json`）时是 `project:<路径>`，否则 `global`；键里没有文件修改时间（平台层的环境缓存有）。
- 候选顺序：设置里的手动路径（不是绝对路径或执行不了就跳过）→ 登录环境 PATH 上的 → 常见目录。常见目录里的只在环境来源是 `fallback` 时才用（-20），其余来源一律以登录环境为准。每个候选都要跑版本命令并解析出版本才算找到，不行换下一个。
- 版本命令以项目文件夹为 cwd、环境合并 `platform.env.runDefaults()`（不让 `go version` 去下载工具链），10 秒超时后结束进程、判为没找到。
- 环境提示：来源 `fallback` 发 `ENV_UNRESOLVED`（`reason` 缺省按 `failed`），`login-shell-degraded` 发 `ENV_DEGRADED`，`path-only` 不发（没有提示码，规格也没要求）。环境结果带 `refreshing` 时，完成后用新环境重新检测、更新缓存并调 `onChanged`；同一个 `refreshing` 只通知一次。
- 不安装任何东西。把 `runDefaults()` 并进子进程环境的是 `src/run/run-env.ts` 的 `buildRunEnv`；安装提示的选择在 `install-hint.ts`（只产出数据，从不执行）。

## 子目录地图

- `src/logs/`：日志的切行、解码和清洗；每个文件旁有同名 `.test.ts`
- `src/library/`：名称（`playground-name.ts`）、创建（`create-playground.ts`）、索引（`library-index.ts`）、扫描判断（`scan-library.ts`，文件头有五行判断表）、门面（`playground-library.ts`）、改名与移到废纸篓（`library-operations.ts`）、自动清理的判断（`auto-clean.ts`）；`library-harness.test.ts` 是测试共用的现场（假平台的内存文件系统，经平台接口 `fs` 使用）
- `src/toolchain/`：版本比较（`version-compare.ts`）、版本命令（`run-version-command.ts`）、找一个工具（`detect-tool.ts`）、对照 requires 判定（`evaluate-requirements.ts`）、门面与缓存（`toolchain-service.ts`）；`toolchain-harness.test.ts` 是测试共用的现场（工具定义、假平台、`resolveWith` 边等边推假时钟）
- `src/ports/`：范围（`port-range.ts`）、槽位分配（`port-slot-allocator.ts`）、运行时选端口与回退（`choose-run-port.ts`）
- `src/prepare/`：依赖安装（`install-dependencies.ts`）、准备的三个步骤（`prepare-install.ts`、`prepare-plan.ts`）、门面（`run-preparer.ts`）、命令第一个词换成真实路径（`resolve-executable.ts`）；`prepare-harness.test.ts` 是测试共用的现场（假平台上装好工具，真的准备器、就绪探测和引擎接在一起）
- `src/scripts/`：语法检查（`check-script.ts`）、监听与重跑（`script-runs.ts`）、路径通配（`watch-glob.ts`）
- `src/run/`：转移表（`run-transitions.ts`）、一次运行的会话（`run-session.ts`，状态与结果字段的账在 `run-record.ts`，启动到就绪的看护在 `startup-watch.ts`，不碰状态机的几个步骤在 `run-session-steps.ts`）、对外的运行句柄类型（`run-handle.ts`）、状态等待者（`state-waiters.ts`）、引擎（`run-engine.ts`）、停止（`stop-process-tree.ts`）、输出收集（`run-output.ts`）、辅助命令（`run-command.ts`，安装与语法检查用）、环境（`run-env.ts`）、就绪探测（`readiness-probe.ts`，真正碰网络的两个动作在 `probe-io.ts`）、快照（`run-snapshot.ts`）、空闲停止的原因（`Run.stop({ idle })`，`StopOptions`）、进程起来的通知（`RunSinks.spawned`，管理进程据此写运行记录）、崩溃后清理出来的 `crashed` 运行（`RunEngine.restoreCrashed`）、引擎自己产生的错误（`run-failures.ts`）、类型与接缝（`run-types.ts`）；`run-harness.test.ts` 是测试共用的现场（假平台、记录事件的出口），只有测试文件能导入 `@runyard/testing`

- `src/template-test/`：隔离模板冒烟（#146），复用模板展开、工具链、准备器、引擎与脚本监听；目录分配/删除和取消信号由调用方注入，不连接管理进程、不改用户模板或资源库。

## 测试

在仓库根目录运行（需要 Node 24）：

```sh
pnpm test --filter @runyard/core
```

日志和运行引擎的单元测试用 `@runyard/testing` 的假平台与假时钟，不依赖平台实现，Windows 任务也要通过。
