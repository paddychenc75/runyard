# 协议：方法和事件

每个方法一个只定义一次的字符串，搜这个字符串就能找到约定、处理函数、调用方三处（§5.2）。传输、握手、错误码见 [protocol.md](protocol.md)；状态含义见 [run-state-machine.md](run-state-machine.md)。

出处：技术设计 §5.2、§4.1 到 §4.8、§5.3；PRD #prd-cli-commands、#prd-run-ownership。标“推”的字段是由命令行参数或 PRD 行为推出来的，设计没有逐字段规定。

**逐字段的定义以 [docs/reference/protocol.md](../reference/protocol.md) 为准**：它由 `pnpm generate` 从 `packages/protocol` 的 zod 定义生成（错误码、退出码、提示码、枚举在 [docs/reference/codes.md](../reference/codes.md)）。本篇保留“为什么这样设计”和各表的来龙去脉，字段名与生成的参考不一致时以参考为准，并改本篇。登记表是 `methodRegistry`、`eventRegistry`，方法名和事件名只在那里定义一次。“未定”见文末。

## 1. 共用类型

| 类型 | 形状 | 出处 |
| --- | --- | --- |
| `Owner` | `{ kind: 'tab', clientId, tabId }` 或 `{ kind: 'cli', agent?, command }` | §5.1 |
| `Playground` | 项目记录：合并 `playground.json` 与 `library.json` 里客户端用得到的字段（`id` `name` `path` `kind` `template` `runner` `packageManager?` `entry?` `note?` `createdAt` `createdBy` `autoClean { enabled, days? }` `scriptAutoRun?` `port?` `lastUsedAt` `lastOpenedAt?` `missingSince?`）；“已保留”不是字段，`autoClean.enabled` 为 `false` 即是。磁盘上才有的字段（`requires`、`toolchainAtCreate`、`open`、`trust`、清理提醒状态）不进协议 | storage.md 第 2 节 |
| `RunSnapshot` | `runId`、`playgroundId`、`name`、`kind`（`server` `static` `oneshot`）、`state`、`reason?`、`stale?`（脚本：语法错误，保留上次输出）、`owner`、`port?`、`url?`（字面量 `127.0.0.1`）、`portFallback?`（`{ wanted, reason, occupant? }`）、`pid?`、`exitCode?`、`startedAt`、`readyMs?`、`durationMs?`、`idleStopAt?`（只有命令行持有的有）、`cursor`、`alreadyRunning?` | §4.3、§4.5、§5.3 示例 |
| `LogEntry` | 见 [protocol.md](protocol.md) 第 4 节 | §5.1 |
| `LocalizedText` | 字符串，或“语言到文字”的对象（`en` 必填）；管理进程原样转发，不挑语言。**还没有代码**：随模板方法加 | §6.8 |
| 游标 | `<runId>:<序号>`，对调用方不透明 | §4.5 |

## 2. 方法

下表“入参”和“出参”只列字段名，可选字段带 `?`。

### 会话

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `challenge` / `hello` | 见 protocol.md 第 2 节 | 同左 | 握手帧不是方法，不在登记表里，见 protocol.md 第 2 节 |
| `ping` | 无 | 空 | 存活探测 |
| `session.bye` | 无 | 空 | 桌面应用正常退出：管理进程停掉这条连接名下所有 `tab` 持有的运行，最多等 5 秒（§2.4） |
| `supervisor.info` | 无 | `protocol`、`version`、`build`、`startedBy`（`app` `cli`）、`runs` | 命令行 `doctor` 用 |
| `supervisor.shutdown` | `ifIdle`、`reason`（`upgrade` `install` `user`） | `{ closing }` | 不在界面进程白名单内；`ifIdle` 为 true 而有运行时 `closing: false`（规格 SUPERVISOR-LIFECYCLE-15） |
| `events.subscribe` | `topics`（`playground` `run` `toolchain` `settings`） | `{ sub }` | 事件按主题订阅，主题是事件名第一个点之前的部分；`run.log` 不在 `run` 主题里，只经 `logs.follow` |
| `events.unsubscribe` | `sub` | 空 | 取消 `events.subscribe` 或 `logs.follow` 返回的订阅 |

### 资源库

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `playground.list` | `filter?`（`{ running?, createdBy? }`，`createdBy` 取 `user` `agent` `cli`） | `Playground[]` | 记录字段见 [storage.md](storage.md) 的 playground 与 library 两节合并 |
| `playground.get` | `playground`（id 或名称） | `Playground` | 找不到：`PLAYGROUND_NOT_FOUND` |
| `playground.create` | `template`、`name?`、`note?`、`autoClean?`（天数）、`vars?`、`ifExists?`（`reuse` `fail`）、`createdBy`（推，来自 `new` 的参数） | `Playground`、`created` | 名称缺省时取“模板标识加序号”（PRD #prd-naming）；`NAME_INVALID` `NAME_RESERVED` `NAME_EXISTS` `TEMPLATE_NOT_FOUND` |
| `playground.rename` | `playground`、`newName` | `Playground` | 固定顺序见 run-state-machine.md 第 5 节；安装中、启动中返回 `BUSY`；占用返回 `PATH_LOCKED` |
| `playground.update` | `playground`、`note?`、`autoClean?`、`scriptAutoRun?` | `Playground` | 改备注、自动清理、脚本保存后自动运行 |
| `playground.duplicate` | `playground`、`name?` | `Playground` | 复制出来的新 `id`、新端口 |
| `playground.trash` | `playground` | `{ trashed, deletedRegenerable }`（推，来自平台层 `fs.trash`；后者是直接删掉的可再生目录的相对路径列表） | 先停止，再走释放顺序；错误 `PATH_LOCKED` `PATH_TOO_LONG` `TRASH_UNAVAILABLE` |
| `playground.relocate` | `playground`、`path` | `Playground` | 接受任意位置的文件夹，只要里面的 `id` 对得上（推自 PRD #prd-decision-table 第 19 项） |
| `playground.forget` | `playground` | 空 | 从资源库移除，不动磁盘 |
| `playground.released` | `playgroundId` | 空 | 客户端回报“我已释放这个项目的句柄”（§4.3） |
| `library.rescan` | 无 | 空 | 重新扫描资源库根目录 |

### 运行

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `run.start` | `playground`、`owner`、`wait`（`none` `ready` `exit`）、`timeoutMs?`（只决定本次调用何时返回，不杀进程）、`port?`（只用于本次） | `RunSnapshot` | 对活动中的项目返回现有运行并带 `alreadyRunning: true` |
| `run.stop` | `runId` 或 `playground` | `RunSnapshot` | 停止算法见 0006；返回时进程树已空、端口已释放 |
| `run.stopAll` | `mine?`（只停命令行持有的） | `{ stopped }`：已停止的 `runId[]` | |
| `run.restart` | `playground` | `RunSnapshot` | |
| `run.get` / `run.list` | `runId` / `running?` | `RunSnapshot` / `RunSnapshot[]` | |
| `run.adopt` | `runId`、`owner`（只收 `tab` 持有者） | `RunSnapshot` | “改为由我管理”：持有者从 `cli` 改 `tab` |
| `run.disown` | `runId` | `RunSnapshot` | 以后的“在后台保持运行”，先留位置 |
| `run.attach` / `run.detach` | `runId`、`clientId` | 空 | “查看”，不改持有者，不算空闲活动 |
| `run.stdin` | `runId`、`data` | 空 | 脚本的标准输入，`data` 原样写入，不补换行。服务和声明 `run.stdin: false` 的运行器：`NOT_SUPPORTED`；没有这个 `runId` 或已结束：`RUN_NOT_FOUND`（规格 run/scripts） |

### 日志

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `logs.read` | `playground`、`since?`（游标）、`tail?`（命令行默认 200）、`raw?` | `entries`（`LogEntry[]`）、`cursor`、`truncated`、`state?`（最近一次运行的状态，从没运行过时没有） | 默认返回清洗后的文本，`raw: true` 原样；游标属于更早一次运行时，返回当前运行全部并 `truncated: true` |
| `logs.follow` | 同上 | `{ sub }` | 之后的新条目以 `run.log` 事件推送，条目形状 `LogEntry`；用 `events.unsubscribe` 取消 |
| `logs.clear` | `playground` | 空 | |

### 模板、工具链、请求面板、设置、自动清理

`request.*` 和 `run.disown` 只在登记表里占名字（`status: reserved`），管理进程回 `NOT_SUPPORTED`。

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `template.list` | 无 | `TemplateRecord[]`：`id` `name` `description`（`LocalizedText`，原样转发）`category` `tags` `source`（`builtin` `user`）`runner` `kind`（运行器不可用时 `null`）`requires` `valid` | 无效的用户模板也在，`valid: false`（规格 templates/custom） |
| `template.get` | `id` | `{ template: TemplateRecord, path, files }` | `TEMPLATE_NOT_FOUND` |
| `template.save` | `playground`、`as`、`name?`、`description?`、`replaceName?`、`include?`、`exclude?`（后两个是相对路径数组） | `{ id, name, path, files, source: 'user' }` | `NAME_INVALID` `NAME_EXISTS` `PLAYGROUND_NOT_FOUND` `FOLDER_MISSING`；路径不合法由入参校验拒绝（`USAGE`）。`template lint`、`template test` 在命令行进程里直接跑，不经管理进程，所以没有方法 |
| `toolchain.check` | `playground?` 或 `template?`、`cachedOnly?` | `{ tools }`，每项 `tool`、`status`（`found` `missing` `too-old` `unknown`）、`path?`、`version?`、`required?`、`untested?`、`source?` | `cachedOnly: true` 只读缓存，不触发检测 |
| `toolchain.doctor` / `.recheck` / `.setPath` | `-` / `-` / `tool`、`path` | 同 `toolchain.check` 的 `{ tools }` | `recheck` 重新解析登录环境、清缓存 |
| `request.send` / `.getLast` | `playground`、`method`、`path`、`headers?`、`body?` | 状态码、耗时、响应头、响应体 | 属于 M3 的请求面板，M1 不实现 |
| `settings.get` / `.set` | `-` / 部分设置 | 设置 | 字段见 storage.md 2.3；协议里现在有 `libraryRoot` `externalEditor?` `packageManager` `scriptAutoRun` `cliIdleStopMinutes` `toolPaths` `ports { min, max }` `urlNewSkipConfirmForBuiltin` `updateCheck`，其余（`autoSave` `network` `theme` `language`）等设置的规格批准后再加 |
| `clean.due` | 无 | `{ remind, clean }`：项目 id 数组，待提醒清单和可清理清单 | 判断在 `core` 的纯函数，调度在桌面应用主进程（§4.7）。清理本身走 `playground.trash`，没有单独的方法 |
| `clean.ackReminder` / `clean.keep` | `playgroundId` | 空 | 界面确认提醒已显示 / 提醒里的“改为保留”。会写共享文件，可能返回 `DATA_FROM_NEWER_VERSION` |

## 3. 事件

| 事件 | 数据 | 触发 |
| --- | --- | --- |
| `playground.added` `.changed` `.missing` | `Playground` | 资源库变化；`missing` 的记录带 `missingSince` |
| `playground.removed` | `{ playgroundId }` | 项目从资源库移除 |
| `playground.releaseRequested` | `{ playgroundId, reason: 'rename' \| 'trash' }` | 管理进程请所有客户端释放句柄，最多等 3 秒（§4.3） |
| `run.state` | `{ run: RunSnapshot, previous?, at, runningCount }`，`runningCount` 是“N 个运行中”（由管理进程算，界面不自己数） | 状态变化 |
| `run.log` | `LogEntry` | 新的一行；只经 `logs.follow` 的订阅推送 |
| `run.exit` | `{ runId, exitCode?, reason? }`；`reason` 可为 `idle`（空闲停止），否则取失败原因 | 进程退出 |
| `run.port` | `{ runId, wanted, actual, occupant? { pid, name }, reason }` | 原端口被占用或被系统保留，本次改用别的端口 |
| `toolchain.changed` `settings.changed` | 空对象（客户端用 `toolchain.check`、`settings.get` 重读） | 后台刷新完成、设置变了 |
| `request.result` `agent.activity` `supervisor.closing` | 未定，只占名字 | |

## 未定

已定的（由 #18 定）：握手帧不用 `req/res` 信封，见 protocol.md 第 2 节；`Playground` 记录的形状和 `playground.list` 的过滤参数（第 1 节）；`logs.read` 出参字段名是 `entries` `cursor` `truncated` `state?`（命令行 `--json` 的 `text` `lines` 由命令行从 `entries` 拼出，不是协议字段）；`run.stopAll` 出参 `{ stopped }`，`supervisor.info` 出参见第 2 节；事件订阅用 `events.subscribe` / `events.unsubscribe`。

1. `toolchain.check` 里工具定义的安装命令如何随出参返回。
2. `request.result` `agent.activity` `supervisor.closing` 的数据形状；请求面板方法（M3）的入参出参。
3. ~~模板方法和自动清理方法的入参出参、`LocalizedText`~~ 已定（#20）：规格没固定字段名的地方（`template.save` 的 `replaceName` `include` `exclude`，`clean.due` 的 `remind` `clean`，`TemplateRecord` 对无效模板的缺省值）是 #20 选的，见 PR。`clean.due` 怎样知道“有标签页开着”（规格 LIBRARY-AUTO-CLEAN-26）规格没写：方法没有入参，需要负责人或后续 issue 定。
4. ~~`run.stdin`~~ 已定（#20）。
5. 设置里 `autoSave` `network` `theme` `language` 的取值，等设置的规格批准。
6. ~~找不到 `runId` 的错误码~~ 已定（#19）：`RUN_NOT_FOUND { runId }`，退出码 3，已加进 `run.stop` `run.get` `run.adopt` `run.attach` `run.detach` 的错误列表。
7. 路径过长的警告（LIBRARY-PLAYGROUNDS-05）和“版本高于上限，未经测试”的提醒（TOOLCHAIN-DETECTION-09）：提示码已定（#19）：`PATH_NEAR_LIMIT { length, limit }`、`TOOL_VERSION_UNTESTED { tool, found, required }`；**结果里放在哪个字段仍未定**（`playground.create` 的出参尚无 notices 字段），文案归 #22。
