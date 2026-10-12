# @runyard/protocol

## 用途

所有跨进程约定的唯一出处：消息、事件、错误码、文件格式的定义（技术设计 §3.2、§4）。桌面应用、管理进程、命令行都从这里导入同一份定义，不各写一份。
现状：已有错误码、提示码、枚举的登记表，以及 `RunyardError`、`Notice`、`LogEntry`、`Owner` 和协议版本号；握手、信封、方法、文件格式随后续 issue 加入。

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
- 提示码在 `notices.ts`，枚举在 `enums.ts`。新增代码时同时在 `i18n` 里补两种语言的文案（`i18n-codes` 检查）。
- 登记表是可遍历的（`errorCodes`、`noticeCodes`、`runStates` 等），`i18n` 的检查靠它。

## 子目录地图

- `src/index.ts`：唯一入口
- `src/errors.ts`：错误码登记表、`RunyardError`
- `src/notices.ts`：提示码登记表、`Notice`
- `src/enums.ts`：运行状态、环境来源、失败原因、端口回退原因
- `src/log-entry.ts`、`src/owner.ts`：`LogEntry`、`Owner`
- `src/protocol-version.ts`：协议版本号
- 每个文件旁边有同名的 `.test.ts`
- `vitest.config.ts`：继承 `tooling/vitest/base.ts`，不要在这里改测试规则

## 测试

在仓库根目录运行（需要 Node 24）：

```sh
pnpm test --filter @runyard/protocol
```

每个 schema 至少有一个“合法数据通过、非法数据被拒绝”的测试。不要为了让测试通过去放宽 schema。
