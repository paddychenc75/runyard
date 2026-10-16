# @runyard/client

## 用途

管理进程的客户端：命令行（#45 到 #47）和桌面应用主进程都用它连管理进程。读发现文件、连得上就握手、连不上就经平台层拉起并重连、按版本表决定用或换或报错，然后给出带类型的 `call` 和事件订阅（技术设计 §5.1、§5.4；决策记录 0005；`docs/architecture/protocol.md` 第 2、5 节）。
不产生给人看的句子，不打印任何东西：错误是 `ClientError`（代码加参数加只进日志的英文 `debug`），提示信息是 `VersionOutcome` 这样的数据，由命令行和应用经 `packages/i18n` 变成文字。

## 对外暴露什么

只从 `src/index.ts` 导出，其他包只从 `@runyard/client` 导入。
- `connectSupervisor(options)`：返回 `RunyardClient`，失败抛 `ClientError`。`options` 的 `platform`、`client`（`kind` `version` `build`）、`launch`（`command` 是启动管理进程的命令前缀，如 `[process.execPath, 入口文件]`，client 在后面补 `--home --version --build --started-by [--host] [--profile]`）由调用方给；`clock`、`protocol`、`timeouts`、`newNonce`、`onDiagnostic` 可省，测试用。
- `RunyardClient`：`call(method, params)`（入参出参类型来自方法登记表，出参按登记表校验）、`subscribe(topics, listener)`、`followLogs(params, listener)`（`logs.follow`，`run.log` 条目经同一套订阅登记到达）、`close()`（立刻断开，不是 `session.bye`）、`closed`；`supervisor`（`SupervisorSummary`）、`outcome`（`VersionOutcome`：`current` / `replaced` / `outdated { reason, runs }`）、`launched`。
- `ClientError`：`code`、`error`（`RunyardError` 或没登记过的 `WireError`）、`known`（登记过才有）。管理进程返回的错误原样带着；连接断了是 `SUPERVISOR_UNAVAILABLE`；出参不合登记表是 `INTERNAL`。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`@runyard/platform`（依赖规则的唯一出处是 `tooling/checks/layers.json`）。不许导入 `supervisor`、`core`、`i18n`；管理进程入口文件的位置由调用方传进来。
- 拉起管理进程只经 `platform.exec.spawnDetached`（与启动者脱钩）；没有 `child_process`、没有手写路径分隔符。配置只走命令行参数。
- 握手只在 `handshake-client.ts`：口令只当 HMAC 的密钥，是发现文件里十六进制口令解出的 32 个原始字节；证明函数用 `platform.ipc.computeProof / verifyProof`，不自己实现。质询不合格式（含 nonce 不是 32 字节、空的）就不发 hello；服务端证明不对就断开，之后一个请求都不发。
- 没有发现文件（或内容不合法）：根本不连接、不发握手消息，按“管理进程不存在”去拉起。有发现文件但握手不过：直接 `SUPERVISOR_UNAVAILABLE`，不拉起；只有“拉起之后”的等待窗口里，发现文件换了新内容才重试一次。
- 重连间隔 50、100、200 毫秒，之后每次 200，总共最多 3 秒；超时 `SUPERVISOR_UNAVAILABLE`。每次重试重新读发现文件（新进程换了口令）。
- 版本表只用 `decideVersionAction`（`packages/protocol`），本包不自己比版本。客户端低于管理进程最低版本时一个请求都不发（`CLIENT_OUTDATED`）。要换新时：`supervisor.shutdown { ifIdle: true, reason: 'upgrade' }`，等旧进程真的退出（内核锁随进程退出才释放），再拉起；只换一次。回 `closing: false`（刚好有了运行）就沿用旧的。
- 订阅的登记发生在 `events.subscribe` 响应到达的那一刻（`onResult`），晚一拍会丢紧跟在响应后面的事件。seq 跳号标 `gap`，调用方应重读快照。
- 时间、平台、随机数都从 `options` 注入，测试里不真的等。

## 子目录地图

- `src/connect-supervisor.ts`（主流程：连、拉起、版本表）、`open-session.ts`（读文件、连接、握手一次尝试）、`launch-supervisor.ts`、`discovery.ts`
- `src/handshake-client.ts`、`connection.ts`（分行、请求响应对应、事件）、`call-method.ts`、`runyard-client.ts`
- `src/connect-options.ts`、`client-clock.ts`、`client-error.ts`
- 测试替身（不是产品代码）：`test-supervisor.ts`（能走歪的假管理进程）、`client-harness.test.ts`（假平台加假时钟）、`process-harness.test.ts`（真进程记账）、`launch-and-hold.fixture.ts`（被强杀的启动者）

## 测试

```sh
pnpm test --filter @runyard/client
```

单元测试用假平台和假时钟，Windows 任务也跑。`*.platform-dependent.test.ts` 起真正的管理进程入口（单独的 Node 进程，临时主目录，绝不碰 `~/.runyard`）：从零启动、同时启动、启动者被强杀、换新、发现文件被删、连接点被占。入口文件用相对路径找（`../../supervisor/src/main.ts`），因为本包不能导入 `supervisor`。真实入口没有办法造出“有运行”或“最低版本高于当前”，那几行版本表（规格 PROTOCOL-HANDSHAKE-09、12、13、14）用假管理进程测。
