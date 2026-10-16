# @runyard/supervisor

## 用途

管理进程（`runyardd`）：单实例、发现文件、握手服务、会话与方法分发、事件订阅、空闲自己退出、关闭（技术设计 §2.1 到 §2.4、§5.1；决策记录 0002、0005）。纯 JS，不导入 Electron，不含原生模块，普通 Node 24 直接运行。
现状：骨架、会话组方法，以及资源库、设置、自动清理、模板的方法（#41、#119）。运行编排与持有者（#40）在 `src/run-*.ts`，经 `createRunModule` 接上；命令行运行的空闲停止和崩溃后清理（#42）、日志（#43）都挂在 `RunObserver` 上，入口用 `composeExtensions`（`compose-extensions.ts`）把它们和运行编排装在一起（见下）。

## 对外暴露什么

只从 `src/index.ts` 导出，其他包只从 `@runyard/supervisor` 导入。
- `startSupervisor(options)`：启动并返回 `SupervisorHandle`（`endpoint`、`token`、`api`、`connectionCount()`、`closed`）。`options.platform` 由调用方显式创建（`getPlatform({ home })`），包内不读 `~`、不读环境变量。别的进程持锁时抛 `BUSY`（`PlatformError`）。
- `supervisorEntryPath()`：入口文件 `src/main.ts` 的绝对路径，给启动者拼命令行（`client` 不能导入本包，入口位置由命令行、桌面应用传给 `connectSupervisor` 的 `launch.command`）。发现文件的路径 `discoveryFilePath` 定义在 `@runyard/platform`（client 也要读），这里再导出。入口参数：`--home --version --build` 必填，`--started-by app|cli`（缺省 cli）、`--host electron|node`、`--profile dev` 可选；退出码：0 正常退出或“已有管理进程”（标准错误一行 `supervisor already running`）、1 启动失败、2 参数不对。
- 接缝（全部可省）：`options.extend(api)` 返回 `SupervisorExtensions`：`handlers`（方法处理函数，类型来自方法登记表，不许与会话组方法重名）、`runCount`（口径同 `run.state` 的 `runningCount`）、`recoverCrashedRuns`（拿到锁之后、写发现文件之前调用一次）、`onShutdown`（关会话之前等它）、`sessions`（`onReady` `onClosed` `onBye`）。`SupervisorApi`：`publish(event, data)`、`notifyRunsChanged()`（运行个数变了必须调，空闲计时靠它）、`readySessions()`、`shutdown(reason)`。
- 资源库一组（`src/library-*.ts`，#41）由管理进程自己登记，不经 `handlers`：`playground.list|get|create|rename|update|trash|relocate|forget|released`、`library.rescan`、`clean.due|ackReminder|keep`、`settings.get|set`。`playground.duplicate` 没有实现（回 `NOT_SUPPORTED`）。依赖别的 issue 的三处经 `SupervisorExtensions.library`（`LibrarySeams`，全部可省）：`runs: RunsView`（#40 实现：`activePlaygrounds`、`isBusy`、`ownerOf`、`stop`、`start`；缺省 `noRuns`）、`templates: TemplateCatalog`（模板各 issue：`seed`、`runnerKind`；缺省创建任何模板都是 `TEMPLATE_NOT_FOUND`）、`ports: PortSlotAllocator`（#36；缺省新项目没有端口）。
- 运行编排（#40，`run-module.ts` 装配）：入口里 `extend: (api) => createRunModule(api, { templateData })`，返回 `handlers`（`run.start|stop|stopAll|restart|get|list|adopt|attach|detach|stdin`）、`runCount`、`onShutdown`（停全部）、`sessions`、`library.runs`（`RunsView`），再加 `engine`、`runs`、`viewers`、`toolchain()`、`installHintFor`。别的 issue 把自己的接缝并进同一个返回值。`SupervisorApi` 为此多了 `openLibrary()`、`readSettings()`。
  - 持有者：`tab` 的运行绑定到发起请求的连接（`run-owners.ts`，键是持有者里的 `clientId`）；`session.bye` 先停这条连接名下的运行（最多等 5 秒，`BYE_STOP_WAIT_MS`）；异常断开后等 5 秒（`DISCONNECT_GRACE_MS`）再停，宽限期里同一类客户端、同一进程号的新连接，或带着同一个 `clientId` 的请求（`attach` 等）算重连。`cli` 的运行不绑定任何连接。`attach`/`detach` 只记账（`RunViewers`），不改持有者、不触发 `mentioned`。
  - 重复启动同 core：活动中返回现有运行（`alreadyRunning: true`，持有者不变）；`stopping` 时新运行排在旧的停止之后，`wait` 不是 `none` 时最多等 10 秒（`STOP_WAIT_LIMIT_MS`），超过撤销新运行并报 `BUSY`。`wait: ready|exit` 失败或 `errored` 时把运行的错误原样抛出，超时是 `READY_TIMEOUT`（进程继续）。`run.start` 调 `library.markUsed`。
  - 给 #42、#43 的缝：`RunObserver`（`mentioned` 命令提到某次运行，`state`、`exit`、`log`）；运行 id 形如 `run-<时间>-<序号>`，管理进程重启后不重复。
- 静态页面服务（#50，`static-server.ts`、`static-path.ts`、`static-reload.ts`、`static-mime.ts`）：`static` 运行器不起子进程，`createRunModule` 缺省把 `createStaticServer({ platform })` 交给准备阶段（`RunModuleOptions.serveStatic` 可换）。只绑 `127.0.0.1`；每次请求现读文件，`Cache-Control: no-store`；路径含 `..`（含编码）、反斜杠、空字符拒绝（403/400），符号链接先 `realpath` 再比对项目根，指到外面的 403；`.runyard/`（含经符号链接绕进去的）一律 404，不列目录，目录只认 `index.html`。HTML 响应在最后一个 `</body>` 前注入刷新脚本，脚本连 `/__runyard/reload`（保留路径，SSE），`platform.watch` 报告文件变化（忽略 `.runyard`、`node_modules`、`.git`）就推 `data: reload`。释放（`dispose`）先停监听、断开全部连接（含 SSE），等端口关闭才返回。这里直接用 `node:fs` 的 `realpath`：平台层没有它，比较的是真实路径。核心的约定：页面服务先监听成功才进 `starting`/`ready`（`run-session.ts` 的 `#launchStatic`）。
- 模板展开成项目（`template-catalog.ts`，`TemplateCatalog` 的真实实现）：`createRunModule` 在收到 `templateData.builtinDir` 时一并给出 `library.templates`（`seed`）和 `library.ports`（端口槽位，范围取设置）。`seed` 只认模板标识（绝对路径是 `TEMPLATE_NOT_FOUND`，路径只有 `template lint` 收），内置的标识优先于同名的用户模板；先过 `lintTemplateRef`，不通过是 `TEMPLATE_INVALID`；`vars` 里没在 `variables` 声明的键、或键为 `name` 是 `VAR_INVALID`；变量只对 `substitute` 所列文件里的 `{{名字}}` 做字面替换（`{{name}}` 是项目名，值里的 `$&` 之类原样保留），非 UTF-8 的文件原样复制。`playground.json` 的 `requires` 只存版本范围，所以模板里 `requires.*.install`（TEMPLATES-CUSTOM-21）到不了运行时，见 PR 说明里的缺口。创建时记的工具版本（`toolchainAtCreate`）是尽力检测，检测不到不挡创建。
- 模板一组（`template-library.ts` 读、`template-handlers.ts` 方法，#119）也由管理进程自己登记：`template.list|get|save`。模板数据的位置由 `options.templateData`（内置模板、运行器、工具定义；入口里开发时指向仓库的 `templates/`）和状态目录下的 `templates/`（用户模板）决定。内置的标识优先：同标识的用户模板在列表里 `valid` 为 `false`，`get` 取内置的，另存同标识报 `NAME_EXISTS`。`template.get` 只认标识，不接受路径。`template.save` 的入参 `as` 在登记表里只要求非空，写法由处理函数按 `templateIdSchema` 校验，不合法回 `NAME_INVALID`（`kind: "template"`），而不是校验先失败的 `USAGE`；别的入参照常校验。另存排队（一个互斥量），同一标识并发另存只有一次成功。
- 改名与移到废纸篓的顺序（技术设计 §4.3）：名称校验、`BUSY`、重名都过了才开始；`RunsView.stop`（要等到进程树连同运行标记的后代都走了）→ `playground.releaseRequested` 广播 → 等回报最多 3 秒（`release-coordinator.ts`，只等订阅了 `playground` 主题的连接，断开的不等，超时记一行 `release timeout`）→ core 的改名或 `fs.trash` → 改名前在运行的用同一持有者 `RunsView.start`。停止在广播之前；改名失败时不替用户把运行再启动起来。
- 写共享文件的方法排队（`async-mutex.ts`，资源库一个、设置一个），读-改-写不交错。`settings.json`、`toolchain.json` 的读写在 `settings-store.ts`、`toolchain-store.ts`（`state-file.ts` 是共用的读法）：经 `writeAtomic`，更新版本写的只读不写（`DATA_FROM_NEWER_VERSION`；`toolchain.json` 例外，不读不写也不报错），坏文件改名留存。`core` 抛的 `LibraryError` 在 `toRunyardError` 里原样转成协议错误。
- 协议没有为找不到文件夹的项目保存模板和运行器：`playground-view.ts` 用最近读到的 `playground.json`，从没读到过时给占位值。
- 日志（#43，`log-module.ts` 装配，入口 `run-main.ts` 里把它的 `observer` 传给 `createRunModule`、`handlers` 并进运行模块的 `handlers`、`onShutdown` 里在停完运行之后 `flush`）：
  - 方法 `logs.read|follow|clear`（`log-handlers.ts`，项目用 id 或名称，找不到是 `PLAYGROUND_NOT_FOUND`）。`RunLogService`（`run-log-service.ts`）每个项目在内存里只留最近一次运行的环形缓冲（`run-log-ring.ts`，1 万行或 4 MB）；磁盘上每次运行一个文件 `logs/<runId>.<playgroundId>.jsonl`（`run-log-files.ts` 管文件名、列表、按最近 5 次清理；`run-log-writer.ts` 管写入）。写入排成一条队、积压的行合成一次追加，写盘失败一律吞掉（内存里照常能读），`flush()` 等队空。
  - 序号：每次运行从 1 起、只增不减，游标是 `<runId>:<序号>`（最后读到的一行）。项目从没运行过时游标是 `none:0`（不属于任何运行，带着它读不算 `truncated`）。游标属于别的运行、或其后的行已被掐掉：给能读到的全部并标 `truncated`；序号超前：空结果。`tail` 在清洗之后取；`raw` 原样。
  - 超过 10 MB 时一次砍到 9 MB 以内的整行（`RUN_LOG_TRIM_TO_BYTES`），不是每写一行都重写；管理进程重启后最近一次运行从磁盘读回来，序号接着往后。
  - `logs.follow` 返回的订阅不接收 `publish` 的任何事件：`run.log` 的事件体里没有项目，所以由日志服务按项目经 `Session.deliverTo` 点对点推送（不清洗时 `raw: true`）。只推订阅之后的新条目，`since`、`tail` 对它没有意义。订阅被取消或连接关闭后下一次推送时顺手清掉。
  - `supervisor.log` 轮转（`supervisor-log-rotation.ts`）：启动时（拿到锁之后）超过 5 MB 就复制到 `.1`（旧的顺延，保留 `.1` 到 `.3`）再清空原文件，不改名（启动者以追加方式打开着它）；只在启动时做。
  - `doctor --bundle` 取最近三次运行日志靠文件名从小到大，改文件名规则要同步 `packages/cli/src/doctor/diagnostic-bundle.ts`。
- 空闲停止（#42，`idle-stop.ts`，PRD #prd-idle-stop）：只盯 `cli` 持有的服务和页面（脚本、标签页持有的不参与；运行被“改为由我管理”后到点也不停）。四种活动只更新“最后活动时间”：stdout/stderr 输出（`RunObserver.log`）、项目文件夹里的文件变化（`platform.watch`，忽略 `.runyard`、`node_modules`、`.git`）、命令行的命令提到它（`RunObserver.mentioned` 与 `logs.read|follow` 经 `LogModuleOptions.onMention`；**只认握手时自称 `cli` 的连接**，应用发的同样请求和 `attach`/`detach` 都不算）、端口上已建立的连接（`platform.ports.connections`，每 `PORT_SAMPLE_MS` = 60 秒采样）。一个到期定时器，到点现读设置 `cliIdleStopMinutes`，没满就按剩余时间再等；满了调 `run.stop({ idle: { minutes } })`（日志 `IDLE_STOPPED`，`run.exit` 带 `reason: 'idle'`）。设置改了从下一次到点起生效。`status <名称>` 由命令行对活动中的运行补发一次 `run.get`，经 `mentioned` 算活动（#141）；“请求面板”还不存在。快照的 `idleStopAt`（CLI-COMMANDS-51）：`RunEngineDeps.idleStopAt(runId, owner)` 由 `IdleStop.idleStopAt` 实现，值是最后活动 + 最近读到的 `cliIdleStopMinutes`，只有 `cli` 持有且被盯着的运行有；快照是现取的，所以活动归零后下一次取到的值已更新（已发出的事件不会重发）。
- 脚本项目保存后自动重跑的监听（#138，`script-watch.ts`，规格 RUN-SCRIPTS-27 到 34）：`createRunModule` 里装配，`RunModule.scriptWatch`。命令行持有的脚本运行（`oneshot`）第一次出现时，在项目开关 `script.autoRun` 与全局 `scriptAutoRun` 都没关的前提下调 core 的 `ScriptRuns.watch`；重跑出来的运行沿用持有者，不会重复监听。结束条件：`run.stop`、`run.stopAll`（`RunControl` 的 `stopRequested`、处理函数里的 `endAll`）、项目被移到废纸篓或改名（经 `RunsView.stop`）、管理进程关闭（`onShutdown` 里先于停运行）、监听空闲满 `cliIdleStopMinutes`。空闲的口径同 `idle-stop.ts`（项目文件夹里的文件变化、`cli` 连接的命令提到它，`logs.read|follow` 经 `onMention`），但只结束监听，不停任何运行（脚本不参与运行的空闲停止，RUN-OWNERSHIP-16）。标签页持有的脚本不监听（桌面应用的行为在 M2，RUN-SCRIPTS-32）。
- 崩溃后清理（#42，`crash-recovery.ts`、`run-record-store.ts`，规格 SUPERVISOR-LIFECYCLE-16、17）：`RunObserver.spawned`（core 的 `RunSinks.spawned`，进程起来和重新加载换进程时）写 `<状态目录>/run/runs/<runId>.json`（`RunRecord`，`processStart` 是平台层给的启动时间），`exit` 时删，同一个运行的写删排成一条。`recoverCrashedRuns` 在拿锁之后、写发现文件之前逐个读：pid 加启动时间都对得上才 `stopProcessTree`（整棵结束，不对就连结束请求都不发）；然后无论如何删记录，并用 `RunEngine.restoreCrashed` 在引擎里留一个 `crashed` 的运行（`run.get`、状态看得见；项目名取资源库，找不到用 id）。坏记录改名留存、里面的进程不动；更新版本写的原样不动。不重新接管。只有起了子进程的运行有记录（`static` 页面服务在管理进程里，随它一起没了）。
- `composeExtensions`（`compose-extensions.ts`）：运行编排 + 日志 + 空闲停止 + 崩溃记录的单一装配，`run-main.ts` 和单元测试现场（`run-harness.test.ts`）都用它；`combineObservers`（`run-observers.ts`）把几个 `RunObserver` 并成一个。`onShutdown` 的顺序：停空闲计时 → 停全部运行 → 等运行记录落盘 → 等日志落盘。
- 处理函数用 `methodFailure(code, params, debug)` 返回协议错误；`HandlerOutcome` 带“响应写出之后”的动作。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`@runyard/platform`、`@runyard/core`（依赖规则的唯一出处是 `tooling/checks/layers.json`）。不许导入 `i18n`，不产生给人看的句子：错误只有代码加参数加英文 `debug`。
- 启动顺序不可调换（决策记录 0005）：`platform.ipc.listen()`（先内核锁，再删残留 socket，再监听）→ 删旧发现文件 → 崩溃清理 → 写发现文件 → 才有人握得上手。拿不到锁时什么共享的东西都不许动。
- 握手只在 `handshake-server.ts`：口令只当 HMAC 的密钥，任何消息里都不出现；失败一律断开且不回任何内容；质询只接受一次应答。口令的密钥是发现文件里十六进制的 32 个原始字节（`Buffer.from(token, 'hex')`），客户端必须一致。
- 方法分发只信方法登记表：入参、出参都用登记表的 zod 校验；方法名不在登记表、登记了但没有处理函数、状态为 `reserved` 一律 `NOT_SUPPORTED`；入参不合是 `USAGE`；出参不合是缺陷（`INTERNAL`，不外发）。
- 一个连接一个会话；单个连接出错（超 8 MB、坏 JSON、握手失败、握手超时 5 秒、事件积压超过 16 MB 的慢消费者）只关这一个连接。
- 发现文件由本包写（600，先写临时文件再改名）：平台层的 `fs.writeAtomic` 还没实现（#28）且没有权限参数；接口补齐后换过去。
- 不读时钟和平台全局：时钟（`SupervisorClock` 即 core 的 `RunClock`）、平台、发现文件存储、随机数都从 `options` 注入。
- `shutdown` 的顺序：停空闲计时 → `onShutdown` → 删发现文件 → 发起 `server.close`（等连接收完才完成，所以不能先等它）→ 关会话（超过 2 秒强断）→ 等服务器关闭（锁随之释放）。

## 子目录地图

- `src/start-supervisor.ts`（启动顺序）、`supervisor-runtime.ts`（把各块接在一起）、`supervisor-options.ts`（选项、接缝类型、常量）、`supervisor-api.ts`
- `src/handshake-server.ts`、`session.ts`（一个连接）、`session-manager.ts`、`dispatch.ts`（分发）、`builtin-methods.ts`（会话组、事件订阅）、`method-failure.ts`
- `src/run-module.ts`（装配）、`run-control.ts`（启动、等待、停止）、`run-handlers.ts`（方法）、`run-owners.ts`（持有者与连接）、`run-subjects.ts`（项目与运行器的事实）
- `src/log-module.ts`（装配）、`log-handlers.ts`、`run-log-service.ts`、`run-log-ring.ts`、`run-log-files.ts`、`run-log-writer.ts`、`supervisor-log-rotation.ts`
- `src/idle-monitor.ts`（管理进程自己 60 秒空闲退出）、`src/script-watch.ts`（脚本自动重跑的监听）、`src/idle-stop.ts`（命令行运行的空闲停止）、`src/crash-recovery.ts`、`src/run-record-store.ts`（崩溃后清理）、`src/compose-extensions.ts`、`src/run-observers.ts`（装配）、`discovery-file.ts`、`supervisor-clock.ts`
- `src/main.ts`（入口，纯 JS）、`run-main.ts`、`parse-args.ts`
- 测试替身（不是产品代码）：`test-client.ts`（能走歪的客户端）、`test-processes.ts`（短前缀临时主目录、起真入口、按 pid 加启动时间记账）、`supervisor-harness.test.ts`（假平台、假时钟、内存里的发现文件；只有 `*.test.ts` 能导入 `@runyard/testing`）

## 测试

```sh
pnpm test --filter @runyard/supervisor
```

单元测试用假平台（`127.0.0.1` 上的 socket）、假时钟，Windows 任务也跑。`*.platform-dependent.test.ts` 把真实入口当单独的 Node 进程跑（临时主目录，绝不碰 `~/.runyard`）：并发启动、强杀后恢复、原始 socket 上握手成败、超长行、管理进程崩溃后下次启动清理（`crash-recovery.platform-dependent.test.ts`：上一个管理进程用“只关监听、不停运行”模拟崩溃）；每个进程按 pid 加启动时间记账，teardown 时核对无遗留。
