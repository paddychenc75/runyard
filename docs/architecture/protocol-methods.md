# 协议：方法和事件

每个方法一个只定义一次的字符串，搜这个字符串就能找到约定、处理函数、调用方三处（§5.2）。传输、握手、错误码见 [protocol.md](protocol.md)；状态含义见 [run-state-machine.md](run-state-machine.md)。

出处：技术设计 §5.2、§4.1 到 §4.8、§5.3；PRD #prd-cli-commands、#prd-run-ownership。标“推”的字段是由命令行参数或 PRD 行为推出来的，设计没有逐字段规定，实现时以 zod 定义为准并回写本篇；“未定”见文末。

## 1. 共用类型

| 类型 | 形状 | 出处 |
| --- | --- | --- |
| `Owner` | `{ kind: 'tab', clientId, tabId }` 或 `{ kind: 'cli', agent?, command }` | §5.1 |
| `RunSnapshot` | `runId`、`playgroundId`、`name`、`kind`（`server` `static` `oneshot`）、`state`、`reason?`、`stale?`（脚本：语法错误，保留上次输出）、`owner`、`port?`、`url?`（字面量 `127.0.0.1`）、`portFallback?`（`{ wanted, reason, occupant? }`）、`pid?`、`exitCode?`、`startedAt`、`readyMs?`、`durationMs?`、`idleStopAt?`（只有命令行持有的有）、`cursor`、`alreadyRunning?` | §4.3、§4.5、§5.3 示例 |
| `LogEntry` | 见 [protocol.md](protocol.md) 第 4 节 | §5.1 |
| `LocalizedText` | 字符串，或“语言到文字”的对象（`en` 必填）；管理进程原样转发，不挑语言 | §6.8 |
| 游标 | `<runId>:<序号>`，对调用方不透明 | §4.5 |

## 2. 方法

下表“入参”和“出参”只列字段名，可选字段带 `?`。

### 会话

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `challenge` / `hello` | 见 protocol.md 第 2 节 | 同左 | 握手，不带 `id` 的特殊帧还是普通请求，见 protocol.md 未定 |
| `ping` | 无 | 空 | 存活探测 |
| `session.bye` | 无 | 空 | 桌面应用正常退出：管理进程停掉这条连接名下所有 `tab` 持有的运行，最多等 5 秒（§2.4） |
| `supervisor.info` | 无 | 协议版本、产品版本、构建标识、启动者、运行数（推） | 命令行 `doctor` 用 |
| `supervisor.shutdown` | `ifIdle`、`reason`（`upgrade` `install` `user`） | 空 | 不在界面进程白名单内 |

### 资源库

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `playground.list` | `filter?`（推：运行中、创建者） | `Playground[]` | 记录字段见 [storage.md](storage.md) 的 playground 与 library 两节合并 |
| `playground.get` | `playground`（id 或名称） | `Playground` | 找不到：`PLAYGROUND_NOT_FOUND` |
| `playground.create` | `template`、`name?`、`note?`、`autoClean?`（天数）、`vars?`、`ifExists?`（`reuse` `fail`）、`createdBy`（推，来自 `new` 的参数） | `Playground`、`created` | 名称缺省时取“模板标识加序号”（PRD #prd-naming）；`NAME_INVALID` `NAME_RESERVED` `NAME_EXISTS` `TEMPLATE_NOT_FOUND` |
| `playground.rename` | `playground`、`newName` | `Playground` | 固定顺序见 run-state-machine.md 第 5 节；安装中、启动中返回 `BUSY`；占用返回 `PATH_LOCKED` |
| `playground.update` | `playground`、`note?`、`autoClean?`、`scriptAutoRun?` | `Playground` | 改备注、自动清理、脚本保存后自动运行 |
| `playground.duplicate` | `playground`、`name?` | `Playground` | 复制出来的新 `id`、新端口 |
| `playground.trash` | `playground` | `{ trashed, deletedRegenerable }`（推，来自平台层 `fs.trash`） | 先停止，再走释放顺序；错误 `PATH_LOCKED` `PATH_TOO_LONG` `TRASH_UNAVAILABLE` |
| `playground.relocate` | `playground`、`path` | `Playground` | 接受任意位置的文件夹，只要里面的 `id` 对得上（推自 PRD #prd-decision-table 第 19 项） |
| `playground.forget` | `playground` | 空 | 从资源库移除，不动磁盘 |
| `playground.released` | `playgroundId` | 空 | 客户端回报“我已释放这个项目的句柄”（§4.3） |
| `library.rescan` | 无 | 空 | 重新扫描资源库根目录 |

### 运行

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `run.start` | `playground`、`owner`、`wait`（`none` `ready` `exit`）、`timeoutMs?`（只决定本次调用何时返回，不杀进程）、`port?`（只用于本次） | `RunSnapshot` | 对活动中的项目返回现有运行并带 `alreadyRunning: true` |
| `run.stop` | `runId` 或 `playground` | `RunSnapshot` | 停止算法见 0006；返回时进程树已空、端口已释放 |
| `run.stopAll` | `mine?`（只停命令行持有的） | 已停止的 `runId[]`（推） | |
| `run.restart` | `playground` | `RunSnapshot` | |
| `run.get` / `run.list` | `runId` / `running?` | `RunSnapshot` / `RunSnapshot[]` | |
| `run.adopt` | `runId`、`owner`（`tab`） | `RunSnapshot` | “改为由我管理”：持有者从 `cli` 改 `tab` |
| `run.disown` | `runId` | `RunSnapshot` | 以后的“在后台保持运行”，先留位置 |
| `run.attach` / `run.detach` | `runId`、`clientId` | 空 | “查看”，不改持有者，不算空闲活动 |
| `run.stdin` | `runId`、`data` | 空 | 脚本的标准输入 |

### 日志

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `logs.read` | `playground`、`since?`（游标）、`tail?`（命令行默认 200）、`raw?` | `entries`（`LogEntry[]`）、`cursor`、`truncated`、`state`（推，字段名见未定） | 默认返回清洗后的文本，`raw: true` 原样；游标属于更早一次运行时，返回当前运行全部并 `truncated: true` |
| `logs.follow` | 同上 | 订阅 `sub` | 条目形状同 `run.log` |
| `logs.clear` | `playground` | 空 | |

### 模板、工具链、请求面板、设置、自动清理

| 方法 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `template.list` / `.get` / `.save` | `-` / `id` / `playground`、`as` | 模板记录（名称、说明是 `LocalizedText`） | `template lint`、`template test` 在命令行进程里直接跑，不经管理进程 |
| `toolchain.check` | `playground?` 或 `template?`、`cachedOnly?` | 每个工具的路径、版本、状态、来源 | `cachedOnly: true` 只读缓存，不触发检测 |
| `toolchain.doctor` / `.recheck` / `.setPath` | `-` / `-` / `tool`、`path` | 检测结果 | `recheck` 重新解析登录环境、清缓存 |
| `request.send` / `.getLast` | `playground`、`method`、`path`、`headers?`、`body?` | 状态码、耗时、响应头、响应体 | 属于 M3 的请求面板，M1 不实现 |
| `settings.get` / `.set` | `-` / 部分设置 | 设置 | 字段见 storage.md |
| `clean.due` / `.ackReminder` / `.keep` | `-` / `playgroundId` / `playgroundId` | 到期清单 / 空 / 空 | 判断在 `core` 的纯函数，调度在桌面应用主进程（§4.7） |

## 3. 事件

| 事件 | 数据 | 触发 |
| --- | --- | --- |
| `playground.added` `.changed` `.removed` `.missing` | `Playground` 或 id | 资源库变化 |
| `playground.releaseRequested` | `{ playgroundId, reason: 'rename' \| 'trash' }` | 管理进程请所有客户端释放句柄，最多等 3 秒（§4.3） |
| `run.state` | `{ run: RunSnapshot, previous, at }`，并带“N 个运行中”（由管理进程算，界面不自己数） | 状态变化 |
| `run.log` | `LogEntry` | 新的一行 |
| `run.exit` | `{ runId, exitCode, reason }`；`reason` 可为 `idle`（空闲停止） | 进程退出 |
| `run.port` | `{ runId, wanted, actual, occupant?, reason }` | 原端口被占用或被系统保留，本次改用别的端口 |
| `request.result` `toolchain.changed` `settings.changed` `agent.activity` `supervisor.closing` | 未定 | |

## 未定

1. 握手帧是否也用 `req/res` 信封（protocol.md 未定第 1 条）。
2. `Playground` 记录在协议里的完整形状（合并 `playground.json` 与 `library.json` 的哪些字段）；`playground.list` 的过滤参数。
3. `logs.read` 出参的字段名（设计的命令行 `--json` 输出是 `text` `lines` `cursor` `state` `truncated`）。
4. `toolchain.check` 出参的逐字段形状；工具定义里的安装命令如何随出参返回。
5. `run.stopAll`、`supervisor.info` 的出参形状。
6. 事件 `request.result` 等 M3 事件的数据形状。
