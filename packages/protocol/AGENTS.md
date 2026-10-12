# @runyard/protocol

## 用途

所有跨进程约定的唯一出处：消息、事件、错误码、文件格式的定义（技术设计 §3.2、§4）。桌面应用、管理进程、命令行都从这里导入同一份定义，不各写一份。
现状：已有错误码、提示码、枚举的登记表，以及 `RunyardError`、`Notice`、`LogEntry`、`Owner`、协议版本号、分帧（NDJSON）、`Frame`、握手三条消息、版本比对、方法和事件的登记表（`methodRegistry`、`eventRegistry`）、`Playground`、`RunSnapshot`、`Settings`、磁盘文件的格式与升级链（`file-*.ts`）、日志行（`log-line.ts`）；模板、自动清理、脚本输入的方法和文件格式随后续 issue 加入。

## 对外暴露什么

只从 `src/index.ts` 导出（包的 `exports` 只有 `.`）。其他包只从 `@runyard/protocol` 导入，不伸进 `src/` 里的内部文件。
数据形状用 zod 定义，类型用 `z.infer` 推出，不手写第二份类型。

## 本包特有的规则

- 可以导入：无。依赖规则的唯一出处是 `tooling/checks/layers.json`，不许 import 其他 `@runyard/*` 包。
- 外部依赖只有 `zod`。加别的依赖要先问，并走 `docs/guides/add-a-dependency.md`。
- 不许用 Node、浏览器、Electron 的任何接口（`node:*`、`window`、`document`、`electron`、`process`）：这个包要能在三种进程里原样运行。
- 不放逻辑、不读文件、不联网、不产生给人看的句子；只放“形状”和常量。给人看的文字走 `i18n`，协议只发“代码加参数”。
- 改已有的消息、错误码、文件格式是破坏性改动：要升协议版本号，并在同一个 PR 里写决策记录。

## 登记表的规则

- 错误码、提示码、枚举值一旦发布，不改名、不复用、不改退出码；只许新增，新增不升协议版本。测试里有一份已发布清单守着（规格 PROTOCOL-HANDSHAKE-18），新增时把新代码加进清单。
- 每个错误码在 `errors.ts` 的 `errorRegistry` 里各登记一次：退出码加 zod 参数定义；参数只放可序列化的简单值，不放句子。退出码表（技术设计 §5.3）里没有的数字不要用，8 留给以后。
- 数据来自更新版本（`readVersioned` 返回 `newer`）：读仍允许（只读视图），任何会写那个文件的操作一律用 `DATA_FROM_NEWER_VERSION { file, found, supported }` 拒绝，退出码 10；不改写、不降级。新加一个会写共享文件的方法，要把这个码加进它的 `errors`（`methods.test.ts` 里有一份清单守着）。全文见 `docs/architecture/storage.md` 第 3 节。
- 提示码在 `notices.ts`，枚举在 `enums.ts`。新增代码时同时在 `i18n` 里补两种语言的文案（`i18n-codes` 检查）。
- 登记表是可遍历的（`errorCodes`、`noticeCodes`、`runStates` 等），`i18n` 的检查靠它。

## 方法与事件的规则

- 方法名只在 `methods-*.ts` 的登记表里写一次，事件名只在 `events.ts`；别处用 `MethodName`、`EventName` 或登记表的键，不再写一遍字符串。握手帧 `challenge` / `hello` 不是方法。
- 新方法放进对应分组文件（`methods-<组>.ts`），并在 `methods.test.ts` 的样例表里补合法与非法样例（类型检查会提醒）；事件同理（`events.test.ts`）。
- 规格没批准的方法不要编形状：用 `methods-reserved.ts` 只占名字（`status: 'reserved'`）。
- 改了定义要运行 `pnpm generate`：`docs/reference/` 里的协议参考是从登记表生成的，`generated-fresh` 检查会拦住过期的。

## 子目录地图

- `src/index.ts`：唯一入口
- `src/errors.ts`：错误码登记表、`RunyardError`
- `src/notices.ts`：提示码登记表、`Notice`
- `src/enums.ts`：运行状态、环境来源、失败原因、端口回退原因
- `src/log-entry.ts`、`src/owner.ts`：`LogEntry`、`Owner`
- `src/protocol-version.ts`：协议版本号
- `src/ndjson.ts`：一行一个 JSON 的编码、分块解码、8 MB 上限（只处理字符串）
- `src/frame.ts`：四种 `Frame`；线上错误 `WireError` 允许不认识的错误码，`toKnownError` 再收窄
- `src/handshake.ts`：`challenge` / `hello` / `ready`、nonce 与 proof 的格式、固定前缀、摘要输入 `proofMessage`、注入用的类型 `ComputeProof`。HMAC 的实现不在这里，在 `platform/ipc`
- `src/version-decision.ts`：握手之后的版本比对纯函数 `decideVersionAction`
- `src/methods.ts`：方法登记表，由 `methods-session|library|run|logs|toolchain|reserved.ts` 合成；`method-definition.ts` 是登记项的形状
- `src/events.ts`：事件登记表。订阅：`events.subscribe` 按主题，`run.log` 只经 `logs.follow`
- `src/playground.ts`、`run-snapshot.ts`、`settings.ts`、`tool-check.ts`、`created-by.ts`、`primitives.ts`：方法和事件共用的数据形状
- `src/file-format.ts`：磁盘文件的升级链框架（纯函数，不读写文件）：`defineFileFormat`、`readVersioned` / `readVersionedText`（返回 `ok` / `newer`（只读）/ `corrupt`）、`canWrite`、`serializeVersioned`、`quarantineFileName`。规则全文见 `docs/architecture/storage.md` 第 3 节
- `src/file-playground.ts`、`file-library.ts`、`file-settings.ts`（含 `cli.json`）、`file-supervisor.ts`（发现文件和运行记录）、`file-toolchain.ts`：每种文件的 zod 定义和 `*FileFormat`。共用的形状取自 `Playground`、`Settings`、`ToolCheck` 等，不另写一份。新增迁移：把 `currentVersion` 加一，在 `migrations` 里补 `vN→vN+1`，在 `file-format` 之外加该文件的升级测试
- `src/log-line.ts`：运行日志文件的一行（`LogEntry` 加 `seq`），坏行不是错误
- `src/sample-data.ts`：只给测试用的样例数据
- 每个文件旁边有同名的 `.test.ts`
- `vitest.config.ts`：继承 `tooling/vitest/base.ts`，不要在这里改测试规则

## 测试

在仓库根目录运行（需要 Node 24）：

```sh
pnpm test --filter @runyard/protocol
```

每个 schema 至少有一个“合法数据通过、非法数据被拒绝”的测试。不要为了让测试通过去放宽 schema。
