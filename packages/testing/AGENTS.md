# @runyard/testing

## 用途

测试替身：让 core、supervisor、client、命令行的单元测试不碰真实系统、不真的等待（技术设计 §3.2，决策记录 0014）。不放产品逻辑，不放需要真实进程的集成辅助（各包自己写）。

## 对外暴露什么

只从 `src/index.ts` 导出。主入口是 `createFakePlatform({ home?, arch?, profile?, id?, caps?, clock? })`，返回 `{ platform, clock, processes, ports, fs, env, tools, desktopCalls, dispose }`：`platform` 是实现了完整 `Platform` 接口的内存版，交给被测代码；其余是测试用来布置和断言的把手。

- `FakeClock`：`now`、`setTimeout`、`setInterval`、`clearTimeout`、`clearInterval`、`sleep`、`pendingTimers`、`advance(ms)`。`advance` 按到点顺序触发定时器，每触发一个就让异步工作跑完。测试里所有超时（停止 3 秒、`graceMs`、慢启动 30 秒、空闲 30 分钟、管理进程空闲 60 秒）都这样推进，不用真的等。`Clock` 是它满足的结构类型；生产代码在自己的包里声明需要的最小类型，不导入本包。
- `processes`（`FakeProcesses`）：`when(argv 或判断函数, 剧本)` 登记进程剧本，后登记的优先，没有剧本的进程一直运行。剧本 `ProcessBehavior`：`output`（按假时间写 stdout/stderr）、`listenOn`（就绪 = 占住端口；端口已被占则 stderr 写一行并以 1 退出）、`exit`（自己退出）、`ignoresStop`（忽略礼貌停止，只有 kill 能结束，用来走强制结束路径）、`stopDelayMs`、`stopExitCode`、`portReleaseDelayMs`、`children`（起子进程；`detached` 脱离进程树，`holdsOutputPipe` 持有输出管道）。时间为 0 的事件在 spawn 时同步发生。`addForeign({ pid?, startTime? })` 造一个不是我们启动的进程，用已用过的 pid 加不同的 startTime 就是“进程号被复用”。`exit(ref, code)` 模拟进程被外力结束；`isAlive`、`alive()` 断言没有残留；`spawned` 记录每次启动的参数。
- `ports`（`FakePorts`）：`occupy`、`reserve`、`release`、`releaseAfter(port, ms)`（过假时间才变空闲）。
- `fs`（`MemoryFs`）：`mkdir`、`writeFile`、`readFile`、`exists`、`list`、`remove`，加 `lock(path)`（moveDir 抛 `PATH_LOCKED`）、`failTrash()`（trash 抛 `TRASH_UNAVAILABLE`）、`trashed`（进了废纸篓的记录）。trash 与 macOS 一致：整个目录进废纸篓、可放回、没有被直接删的子路径。
- `env`（`FakeEnv`）：`set`、`degraded()`、`fallback(env)`（解析超时后的回退）、`hold()`（load 一直等到放行）、`loadCalls`、`runDefaults`。
- `tools`（`FakeToolSpec` 登记）：`install(tool, { version, path?, origin?, visibleWhen?, versionOutput?, versionCommandFails? })` 同时让 `which`、`candidates` 和“执行版本命令”（Go 是 `version`，其余 `--version`）有结果；`missing(tool)`。过旧、过高只是版本号不同，判断归 core。
- `createTempHome()`：在系统临时目录建 `runyard-test-*` 主目录，里面有 `.runyard` 和 `Runyard`，`dispose()` 删除。需要真实目录的集成式测试用它。

怎样把家目录换成临时目录：显式传参（`home` 选项），不读环境变量（决策记录 0014）。`createFakePlatform` 拒绝真实主目录。

## 本包特有的规则

- 只在 `*.test.ts` 里被导入：别的包只能把它写在 `devDependencies`（`layers` 检查），非测试源码导入它会被 `testing-imports` 检查拦住。
- 可以导入 `@runyard/protocol`、`@runyard/platform`，不导入 `@runyard/core`（core 的测试要用本包，导入会成环）。不装第三方依赖。
- 假平台必须与真实 `Platform` 接口一致：`paths` 直接用真实实现的纯函数，不重写规则；接口加成员时 TypeScript 会在 `fake-platform.ts` 报错。假平台过 `@runyard/platform/contract` 的同一组契约测试（`fake-platform.contract.platform-dependent.test.ts`，`complete: true` 表示没有占位成员；带 platform-dependent 后缀，因为 `paths` 的契约用例按 POSIX 路径写，Windows 任务不跑它）；真实现换掉占位的契约用例后，假平台自动跟着被检验。
- 已知与真实实现不同的地方：`ipc` 用 127.0.0.1 上的临时 TCP 端口（Node 的 Server 和 Socket 没有内存版），测试结束调用 `dispose()`；`watch` 同步通知；`writeAtomic` 要求父目录已存在（和真实一致），`MemoryFs.writeFile` 则会自动建父目录（布置现场用）。
- 不用真实的 `setTimeout` 等待；不启动真实进程；不碰真实目录（`createTempHome` 除外）。

## 子目录地图

- `src/fake-clock.ts`、`src/fake-ports.ts`、`src/memory-fs.ts`、`src/fake-processes.ts`（类型在 `process-behavior.ts`）、`src/fake-toolchain.ts`、`src/fake-platform.ts`、`src/temp-home.ts`：每个旁边有同名 `.test.ts`
- `src/run-example.test.ts`：“怎样给一次运行写单元测试”的示例，`docs/guides/testing.md` 引用它

## 测试

```sh
pnpm test --filter @runyard/testing
```

本包除契约那一个文件外都平台无关（只用假的），Windows 任务也跑。
