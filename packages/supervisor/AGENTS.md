# @runyard/supervisor

## 用途

管理进程（`runyardd`）：单实例、发现文件、握手服务、会话与方法分发、事件订阅、空闲自己退出、关闭（技术设计 §2.1 到 §2.4、§5.1；决策记录 0002、0005）。纯 JS，不导入 Electron，不含原生模块，普通 Node 24 直接运行。
现状：骨架、会话组方法，以及资源库、设置、自动清理、模板（读）的方法（#41）。运行编排与持有者（#40）、崩溃后清理与命令行运行的空闲停止（#42）、日志（#43）由各自的 issue 通过下面的接缝接上，不改这里的类型。

## 对外暴露什么

只从 `src/index.ts` 导出，其他包只从 `@runyard/supervisor` 导入。
- `startSupervisor(options)`：启动并返回 `SupervisorHandle`（`endpoint`、`token`、`api`、`connectionCount()`、`closed`）。`options.platform` 由调用方显式创建（`getPlatform({ home })`），包内不读 `~`、不读环境变量。别的进程持锁时抛 `BUSY`（`PlatformError`）。
- `supervisorEntryPath()`：入口文件 `src/main.ts` 的绝对路径，给启动者拼命令行（`client` 不能导入本包，入口位置由命令行、桌面应用传给 `connectSupervisor` 的 `launch.command`）。发现文件的路径 `discoveryFilePath` 定义在 `@runyard/platform`（client 也要读），这里再导出。入口参数：`--home --version --build` 必填，`--started-by app|cli`（缺省 cli）、`--host electron|node`、`--profile dev` 可选；退出码：0 正常退出或“已有管理进程”（标准错误一行 `supervisor already running`）、1 启动失败、2 参数不对。
- 接缝（全部可省）：`options.extend(api)` 返回 `SupervisorExtensions`：`handlers`（方法处理函数，类型来自方法登记表，不许与会话组方法重名）、`runCount`（口径同 `run.state` 的 `runningCount`）、`recoverCrashedRuns`（拿到锁之后、写发现文件之前调用一次）、`onShutdown`（关会话之前等它）、`sessions`（`onReady` `onClosed` `onBye`）。`SupervisorApi`：`publish(event, data)`、`notifyRunsChanged()`（运行个数变了必须调，空闲计时靠它）、`readySessions()`、`shutdown(reason)`。
- 资源库一组（`src/library-*.ts`，#41）由管理进程自己登记，不经 `handlers`：`playground.list|get|create|rename|update|trash|relocate|forget|released`、`library.rescan`、`clean.due|ackReminder|keep`、`settings.get|set`、`template.list|get`。`playground.duplicate` 和 `template.save` 没有实现（回 `NOT_SUPPORTED`）。依赖别的 issue 的三处经 `SupervisorExtensions.library`（`LibrarySeams`，全部可省）：`runs: RunsView`（#40 实现：`activePlaygrounds`、`isBusy`、`ownerOf`、`stop`、`start`；缺省 `noRuns`）、`templates: TemplateCatalog`（模板各 issue：`list`、`get`、`seed`、`runnerKind`；缺省没有模板）、`ports: PortSlotAllocator`（#36；缺省新项目没有端口）。
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
- `src/idle-monitor.ts`（60 秒空闲）、`discovery-file.ts`、`supervisor-clock.ts`
- `src/main.ts`（入口，纯 JS）、`run-main.ts`、`parse-args.ts`
- 测试替身（不是产品代码）：`test-client.ts`（能走歪的客户端）、`test-processes.ts`（短前缀临时主目录、起真入口、按 pid 加启动时间记账）、`supervisor-harness.test.ts`（假平台、假时钟、内存里的发现文件；只有 `*.test.ts` 能导入 `@runyard/testing`）

## 测试

```sh
pnpm test --filter @runyard/supervisor
```

单元测试用假平台（`127.0.0.1` 上的 socket）、假时钟，Windows 任务也跑。`*.platform-dependent.test.ts` 把真实入口当单独的 Node 进程跑（临时主目录，绝不碰 `~/.runyard`）：并发启动、强杀后恢复、原始 socket 上握手成败、超长行；每个进程按 pid 加启动时间记账，teardown 时核对无遗留。
