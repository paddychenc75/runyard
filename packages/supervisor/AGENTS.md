# @runyard/supervisor

## 用途

管理进程（`runyardd`）：单实例、发现文件、握手服务、会话与方法分发、事件订阅、空闲自己退出、关闭（技术设计 §2.1 到 §2.4、§5.1；决策记录 0002、0005）。纯 JS，不导入 Electron，不含原生模块，普通 Node 24 直接运行。
现状：骨架、会话组方法，以及资源库、设置、自动清理、模板的方法（#41、#119）。运行编排与持有者（#40）在 `src/run-*.ts`，经 `createRunModule` 接上；崩溃后清理与命令行运行的空闲停止（#42）、日志（#43）由各自的 issue 通过下面的接缝和 `RunObserver` 接上。

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
- 模板一组（`template-library.ts` 读、`template-handlers.ts` 方法，#119）也由管理进程自己登记：`template.list|get|save`。模板数据的位置由 `options.templateData`（内置模板、运行器、工具定义；入口里开发时指向仓库的 `templates/`）和状态目录下的 `templates/`（用户模板）决定。内置的标识优先：同标识的用户模板在列表里 `valid` 为 `false`，`get` 取内置的，另存同标识报 `NAME_EXISTS`。`template.get` 只认标识，不接受路径。`template.save` 的入参 `as` 在登记表里只要求非空，写法由处理函数按 `templateIdSchema` 校验，不合法回 `NAME_INVALID`（`kind: "template"`），而不是校验先失败的 `USAGE`；别的入参照常校验。另存排队（一个互斥量），同一标识并发另存只有一次成功。
- 改名与移到废纸篓的顺序（技术设计 §4.3）：名称校验、`BUSY`、重名都过了才开始；`RunsView.stop`（要等到进程树连同运行标记的后代都走了）→ `playground.releaseRequested` 广播 → 等回报最多 3 秒（`release-coordinator.ts`，只等订阅了 `playground` 主题的连接，断开的不等，超时记一行 `release timeout`）→ core 的改名或 `fs.trash` → 改名前在运行的用同一持有者 `RunsView.start`。停止在广播之前；改名失败时不替用户把运行再启动起来。
- 写共享文件的方法排队（`async-mutex.ts`，资源库一个、设置一个），读-改-写不交错。`settings.json`、`toolchain.json` 的读写在 `settings-store.ts`、`toolchain-store.ts`（`state-file.ts` 是共用的读法）：经 `writeAtomic`，更新版本写的只读不写（`DATA_FROM_NEWER_VERSION`；`toolchain.json` 例外，不读不写也不报错），坏文件改名留存。`core` 抛的 `LibraryError` 在 `toRunyardError` 里原样转成协议错误。
- 协议没有为找不到文件夹的项目保存模板和运行器：`playground-view.ts` 用最近读到的 `playground.json`，从没读到过时给占位值。
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
- `src/idle-monitor.ts`（60 秒空闲）、`discovery-file.ts`、`supervisor-clock.ts`
- `src/main.ts`（入口，纯 JS）、`run-main.ts`、`parse-args.ts`
- 测试替身（不是产品代码）：`test-client.ts`（能走歪的客户端）、`test-processes.ts`（短前缀临时主目录、起真入口、按 pid 加启动时间记账）、`supervisor-harness.test.ts`（假平台、假时钟、内存里的发现文件；只有 `*.test.ts` 能导入 `@runyard/testing`）

## 测试

```sh
pnpm test --filter @runyard/supervisor
```

单元测试用假平台（`127.0.0.1` 上的 socket）、假时钟，Windows 任务也跑。`*.platform-dependent.test.ts` 把真实入口当单独的 Node 进程跑（临时主目录，绝不碰 `~/.runyard`）：并发启动、强杀后恢复、原始 socket 上握手成败、超长行；每个进程按 pid 加启动时间记账，teardown 时核对无遗留。
