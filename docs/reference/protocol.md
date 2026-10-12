<!-- 生成文件：由 pnpm generate 从 packages/protocol 的 zod 定义生成，不要手改。 -->
<!-- 要改内容，改 packages/protocol 里的定义，再运行 pnpm generate。 -->

# 协议参考：方法和事件

传输、握手、信封见 [protocol.md](../architecture/protocol.md)；为什么这样设计见 [protocol-methods.md](../architecture/protocol-methods.md)。
“必填”为否的字段可以省略；接收方忽略不认识的字段。所有方法在入参不合法时返回 `USAGE`，出了意外返回 `INTERNAL`，下面只列各方法特有的错误码。握手帧 `challenge`、`hello` 不是方法，见 protocol.md 第 2 节。

## 方法

### 会话

#### `ping`

存活探测

入参：

无字段（`{}`）

出参：

无字段（`{}`）

#### `session.bye`

桌面应用正常退出：管理进程停掉这条连接名下所有标签页持有的运行，最多等 5 秒

入参：

无字段（`{}`）

出参：

无字段（`{}`）

#### `supervisor.info`

管理进程自己的信息，命令行 doctor 用

入参：

无字段（`{}`）

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `protocol` | `integer` | 是 | > 0 |
| `version` | `string` | 是 | 产品版本；非空 |
| `build` | `string` | 是 | 构建标识；非空 |
| `startedBy` | `'app' \| 'cli'` | 是 |  |
| `runs` | `integer` | 是 | 运行个数，口径同 run.state 的 runningCount；≥ 0 |

#### `supervisor.shutdown`

请管理进程退出；不在界面进程的白名单内。ifIdle 为 true 时只在没有运行时才退出

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ifIdle` | `boolean` | 是 |  |
| `reason` | `'upgrade' \| 'install' \| 'user'` | 是 |  |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `closing` | `boolean` | 是 | false：因为还有运行，没有关闭 |

### 事件订阅

#### `events.subscribe`

按主题订阅事件；事件帧里的 sub 就是这里返回的值

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `topics` | `('playground' \| 'run' \| 'toolchain' \| 'settings')[]` | 是 | 至少一项 |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sub` | `integer` | 是 | ≥ 0 |

#### `events.unsubscribe`

取消一个订阅（events.subscribe 或 logs.follow 返回的）

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sub` | `integer` | 是 | ≥ 0 |

出参：

无字段（`{}`）

### 资源库

#### `playground.list`

列出资源库里的项目

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `filter` | `{ running?: boolean; createdBy?: 'user' \| 'agent' \| 'cli' }` | 否 |  |

出参：

类型 `Playground[]`

#### `playground.get`

取一个项目

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |

出参：

类型 `Playground`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`

#### `playground.create`

从模板创建项目；名称缺省时取“模板标识加序号”

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `template` | `string` | 是 | 非空 |
| `name` | `string` | 否 | 非空 |
| `note` | `string` | 否 |  |
| `autoClean` | `integer` | 否 | > 0 |
| `vars` | `Record<string, string>` | 否 | 模板变量 |
| `ifExists` | `'reuse' \| 'fail'` | 否 |  |
| `createdBy` | `{ kind: 'user' \| 'agent' \| 'cli'; agent?: string; command?: string }` | 是 |  |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `Playground` | 是 |  |
| `created` | `boolean` | 是 |  |

可能返回的错误码：`NAME_INVALID`、`NAME_RESERVED`、`NAME_EXISTS`、`TEMPLATE_NOT_FOUND`、`VAR_INVALID`、`DATA_FROM_NEWER_VERSION`

#### `playground.rename`

改名；正在运行的先停止、改名、再用新名称启动

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `newName` | `string` | 是 | 非空 |

出参：

类型 `Playground`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING`、`NAME_INVALID`、`NAME_RESERVED`、`NAME_EXISTS`、`BUSY`、`PATH_LOCKED`、`DATA_FROM_NEWER_VERSION`

#### `playground.update`

改备注、自动清理（null 关闭）、脚本保存后自动运行

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `note` | `string` | 否 |  |
| `autoClean` | `integer \| null` | 否 |  |
| `scriptAutoRun` | `boolean` | 否 |  |

出参：

类型 `Playground`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`DATA_FROM_NEWER_VERSION`

#### `playground.duplicate`

复制一个项目，得到新 id 和新端口

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `name` | `string` | 否 | 非空 |

出参：

类型 `Playground`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING`、`NAME_INVALID`、`NAME_RESERVED`、`NAME_EXISTS`、`DATA_FROM_NEWER_VERSION`

#### `playground.trash`

先停止，再走释放顺序，只通过平台层移到废纸篓；放不进就失败，不做永久删除

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `trashed` | `boolean` | 是 |  |
| `deletedRegenerable` | `string[]` | 是 | 为省空间直接删掉的可再生目录（相对路径） |

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING`、`PATH_LOCKED`、`PATH_TOO_LONG`、`TRASH_UNAVAILABLE`、`DATA_FROM_NEWER_VERSION`

#### `playground.relocate`

重新定位找不到的项目：指向任意位置的文件夹，只要里面的 id 对得上

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `path` | `string` | 是 | 非空 |

出参：

类型 `Playground`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`DATA_FROM_NEWER_VERSION`

#### `playground.forget`

从资源库移除，不动磁盘

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |

出参：

无字段（`{}`）

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`DATA_FROM_NEWER_VERSION`

#### `playground.released`

客户端回报“我已释放这个项目的句柄”，回应 playground.releaseRequested

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playgroundId` | `string` | 是 | 非空 |

出参：

无字段（`{}`）

#### `library.rescan`

重新扫描资源库根目录

入参：

无字段（`{}`）

出参：

无字段（`{}`）

可能返回的错误码：`DATA_FROM_NEWER_VERSION`

### 运行

#### `run.start`

启动一个项目；对活动中的项目返回现有运行并带 alreadyRunning

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `owner` | `Owner` | 是 |  |
| `wait` | `'none' \| 'ready' \| 'exit'` | 是 | none 立即返回；ready 等就绪；exit 等退出 |
| `timeoutMs` | `integer` | 否 | 只决定本次调用何时返回，不杀进程；> 0 |
| `port` | `integer` | 否 | 只用于本次；≥ 1；≤ 65535 |

出参：

类型 `RunSnapshot`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING`、`TOOL_MISSING`、`TOOL_TOO_OLD`、`RUNTIME_MISSING`、`SETUP_FAILED`、`DEPS_OFFLINE`、`RUN_FAILED`、`SCRIPT_ERRORED`、`READY_TIMEOUT`、`DATA_FROM_NEWER_VERSION`

#### `run.stop`

停止整棵进程树；返回时进程树已空、端口已释放。runId 和 playground 恰好给一个

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 否 | 非空 |
| `playground` | `string` | 否 | 项目的 id 或名称；非空 |

出参：

类型 `RunSnapshot`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`RUN_NOT_FOUND`

#### `run.stopAll`

停止全部运行；带 mine 时只停命令行持有的

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `mine` | `boolean` | 否 |  |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `stopped` | `string[]` | 是 |  |

#### `run.restart`

先停止再启动，端口不变

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |

出参：

类型 `RunSnapshot`

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING`、`TOOL_MISSING`、`TOOL_TOO_OLD`、`RUNTIME_MISSING`、`SETUP_FAILED`、`DEPS_OFFLINE`、`RUN_FAILED`、`SCRIPT_ERRORED`、`READY_TIMEOUT`、`DATA_FROM_NEWER_VERSION`

#### `run.get`

取一次运行

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |

出参：

类型 `RunSnapshot`

可能返回的错误码：`RUN_NOT_FOUND`

#### `run.list`

列出运行

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `running` | `boolean` | 否 | 只要仍计入“运行中”的 |

出参：

类型 `RunSnapshot[]`

#### `run.adopt`

“改为由我管理”：持有者从命令行改为这个标签页

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `owner` | `{ kind: 'tab'; clientId: string; tabId: string }` | 是 |  |

出参：

类型 `RunSnapshot`

可能返回的错误码：`RUN_NOT_FOUND`

#### `run.attach`

“查看”：不改持有者，不算空闲活动

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `clientId` | `string` | 是 | 非空 |

出参：

无字段（`{}`）

可能返回的错误码：`RUN_NOT_FOUND`

#### `run.detach`

结束“查看”

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `clientId` | `string` | 是 | 非空 |

出参：

无字段（`{}`）

可能返回的错误码：`RUN_NOT_FOUND`

#### `run.disown`

以后的“在后台保持运行”，先留位置

只占名字：形状和行为等对应规格批准后再定，现在回 `NOT_SUPPORTED`。

### 日志

#### `logs.read`

读日志。默认返回清洗后的文本，raw 为 true 时原样；游标属于更早一次运行时返回当前运行全部并标 truncated

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `since` | `string` | 否 | 只返回这个游标之后的内容；格式 `^[^:\s]+:\d+$` |
| `tail` | `integer` | 否 | 只要最后几行；命令行默认传 200；> 0 |
| `raw` | `boolean` | 否 | true：原样返回，不清洗 |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `entries` | `LogEntry[]` | 是 |  |
| `cursor` | `string` | 是 | 下次传给 since 的游标；格式 `^[^:\s]+:\d+$` |
| `truncated` | `boolean` | 是 |  |
| `state` | `'checking' \| 'installing' \| 'starting' \| 'ready' \| 'reloading' \| 'running' \| 'stopping' \| 'stopped' \| 'finished' \| 'errored' \| 'crashed' \| 'failed'` | 否 | 最近一次运行的状态；项目从没运行过时没有 |

可能返回的错误码：`PLAYGROUND_NOT_FOUND`

#### `logs.follow`

订阅一个项目的日志；之后的新条目以 run.log 事件推送，经 events.unsubscribe 取消

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |
| `since` | `string` | 否 | 只返回这个游标之后的内容；格式 `^[^:\s]+:\d+$` |
| `tail` | `integer` | 否 | 只要最后几行；命令行默认传 200；> 0 |
| `raw` | `boolean` | 否 | true：原样返回，不清洗 |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `sub` | `integer` | 是 | ≥ 0 |

可能返回的错误码：`PLAYGROUND_NOT_FOUND`

#### `logs.clear`

清除一个项目的日志

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 是 | 项目的 id 或名称；非空 |

出参：

无字段（`{}`）

可能返回的错误码：`PLAYGROUND_NOT_FOUND`

### 工具链

#### `toolchain.check`

检查一个项目或一个模板用得到的工具；cachedOnly 为 true 时只读缓存，不触发检测

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playground` | `string` | 否 | 项目的 id 或名称；非空 |
| `template` | `string` | 否 | 非空 |
| `cachedOnly` | `boolean` | 否 |  |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tools` | `({ tool: string; status: 'found' \| 'missing' \| 'too-old' \| 'unknown'; path?: string; version?: string; required?: string; untested?: boolean; source?: 'login-shell' \| 'login-shell-degraded' \| 'path-only' \| 'fallback' })[]` | 是 |  |

可能返回的错误码：`PLAYGROUND_NOT_FOUND`、`TEMPLATE_NOT_FOUND`

#### `toolchain.doctor`

检测全部已知工具

入参：

无字段（`{}`）

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tools` | `({ tool: string; status: 'found' \| 'missing' \| 'too-old' \| 'unknown'; path?: string; version?: string; required?: string; untested?: boolean; source?: 'login-shell' \| 'login-shell-degraded' \| 'path-only' \| 'fallback' })[]` | 是 |  |

#### `toolchain.recheck`

清缓存、重新解析登录环境并重新检测

入参：

无字段（`{}`）

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tools` | `({ tool: string; status: 'found' \| 'missing' \| 'too-old' \| 'unknown'; path?: string; version?: string; required?: string; untested?: boolean; source?: 'login-shell' \| 'login-shell-degraded' \| 'path-only' \| 'fallback' })[]` | 是 |  |

#### `toolchain.setPath`

手动指定一个工具的路径，排在所有自动查找之前，并重新检测

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tool` | `string` | 是 | 非空 |
| `path` | `string` | 是 | 非空 |

出参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `tools` | `({ tool: string; status: 'found' \| 'missing' \| 'too-old' \| 'unknown'; path?: string; version?: string; required?: string; untested?: boolean; source?: 'login-shell' \| 'login-shell-degraded' \| 'path-only' \| 'fallback' })[]` | 是 |  |

可能返回的错误码：`DATA_FROM_NEWER_VERSION`

### 设置

#### `settings.get`

取设置

入参：

无字段（`{}`）

出参：

类型 `Settings`

#### `settings.set`

改设置：只传要改的字段，返回改后的全部设置

入参：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `libraryRoot` | `string` | 否 | 非空 |
| `externalEditor` | `string` | 否 | 非空 |
| `packageManager` | `'auto' \| 'pnpm' \| 'npm'` | 否 |  |
| `scriptAutoRun` | `boolean` | 否 |  |
| `cliIdleStopMinutes` | `integer` | 否 | > 0 |
| `toolPaths` | `Record<string, string>` | 否 | 工具名到绝对路径 |
| `ports` | `{ min: integer; max: integer }` | 否 | 分配端口的范围，含两端 |
| `urlNewSkipConfirmForBuiltin` | `boolean` | 否 |  |
| `updateCheck` | `boolean` | 否 |  |

出参：

类型 `Settings`

可能返回的错误码：`DATA_FROM_NEWER_VERSION`

### 请求面板

#### `request.send`

请求面板发请求（M3）

只占名字：形状和行为等对应规格批准后再定，现在回 `NOT_SUPPORTED`。

#### `request.getLast`

请求面板取上一次请求（M3）

只占名字：形状和行为等对应规格批准后再定，现在回 `NOT_SUPPORTED`。

## 事件

#### `playground.added`

资源库里多了一个项目。经 `events.subscribe` 订阅主题 `playground`。

数据：

类型 `Playground`

#### `playground.changed`

项目的记录变了（含按 id 认回、改了路径）。经 `events.subscribe` 订阅主题 `playground`。

数据：

类型 `Playground`

#### `playground.removed`

项目从资源库移除（移到废纸篓或忘记）。经 `events.subscribe` 订阅主题 `playground`。

数据：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playgroundId` | `string` | 是 | 非空 |

#### `playground.missing`

找不到项目的文件夹；记录里带 missingSince。经 `events.subscribe` 订阅主题 `playground`。

数据：

类型 `Playground`

#### `playground.releaseRequested`

管理进程请所有客户端释放这个项目的句柄，最多等 3 秒；释放后调 playground.released。经 `events.subscribe` 订阅主题 `playground`。

数据：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `playgroundId` | `string` | 是 | 非空 |
| `reason` | `'rename' \| 'trash'` | 是 |  |

#### `run.state`

运行的状态变了；runningCount 由管理进程算，界面不自己数。经 `events.subscribe` 订阅主题 `run`。

数据：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `run` | `RunSnapshot` | 是 |  |
| `previous` | `'checking' \| 'installing' \| 'starting' \| 'ready' \| 'reloading' \| 'running' \| 'stopping' \| 'stopped' \| 'finished' \| 'errored' \| 'crashed' \| 'failed'` | 否 | 上一个状态；第一个状态没有 |
| `at` | `integer` | 是 | ≥ 0 |
| `runningCount` | `integer` | 是 | “N 个运行中”；≥ 0 |

#### `run.log`

日志里多了一条；只经 logs.follow 的订阅推送。经 `logs.follow` 订阅。

数据：

类型 `LogEntry`

#### `run.exit`

运行的进程退出；reason 为 idle 表示命令行持有的运行空闲后被停止。经 `events.subscribe` 订阅主题 `run`。

数据：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `exitCode` | `integer` | 否 |  |
| `reason` | `'TOOL_MISSING' \| 'TOOL_TOO_OLD' \| 'SETUP_FAILED' \| 'DEPS_OFFLINE' \| 'RUN_FAILED' \| 'RUNTIME_MISSING' \| 'idle'` | 否 |  |

#### `run.port`

登记的端口被占用或被系统保留，本次改用别的端口。经 `events.subscribe` 订阅主题 `run`。

数据：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `wanted` | `integer` | 是 | ≥ 1；≤ 65535 |
| `actual` | `integer` | 是 | ≥ 1；≤ 65535 |
| `occupant` | `{ pid: integer; name: string }` | 否 |  |
| `reason` | `'PORT_OCCUPIED' \| 'PORT_RESERVED'` | 是 |  |

#### `toolchain.changed`

工具检测结果变了（后台刷新完成）；不带数据，客户端用 toolchain.check 重读。经 `events.subscribe` 订阅主题 `toolchain`。

数据：

无字段（`{}`）

#### `settings.changed`

设置变了；不带数据，客户端用 settings.get 重读。经 `events.subscribe` 订阅主题 `settings`。

数据：

无字段（`{}`）

#### `request.result`

请求面板的结果（M3）。还没有人能订阅。

只占名字：数据形状等对应规格批准后再定。

#### `agent.activity`

智能体活动（以后）。还没有人能订阅。

只占名字：数据形状等对应规格批准后再定。

#### `supervisor.closing`

管理进程即将退出（以后）。还没有人能订阅。

只占名字：数据形状等对应规格批准后再定。

## 共用类型

### `LogEntry`

以下几种之一：

**`kind = 'stdout' \| 'stderr' \| 'command'`**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `at` | `integer` | 是 | ≥ 0 |
| `kind` | `'stdout' \| 'stderr' \| 'command'` | 是 |  |
| `text` | `string` | 是 |  |

**`kind = 'system'`**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `at` | `integer` | 是 | ≥ 0 |
| `kind` | `'system'` | 是 |  |
| `notice` | `Notice` | 是 |  |

### `Notice`

`{ code, params }`；已登记的提示码和参数见 [codes.md](codes.md)。

### `Owner`

以下几种之一：

**`kind = 'tab'`**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `kind` | `'tab'` | 是 |  |
| `clientId` | `string` | 是 | 非空 |
| `tabId` | `string` | 是 | 非空 |

**`kind = 'cli'`**

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `kind` | `'cli'` | 是 |  |
| `agent` | `string` | 否 | 非空 |
| `command` | `string` | 是 |  |

### `Playground`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 创建时生成、之后不变；文件夹改名或移动后靠它认回；非空 |
| `name` | `string` | 是 | 文件夹名；非空 |
| `path` | `string` | 是 | 文件夹的绝对路径；非空 |
| `kind` | `'server' \| 'static' \| 'oneshot'` | 是 |  |
| `template` | `{ id: string; source: 'builtin' \| 'user'; appVersion: string }` | 是 |  |
| `runner` | `string` | 是 | 运行器 id；非空 |
| `packageManager` | `'pnpm' \| 'npm'` | 否 |  |
| `entry` | `string` | 否 | 入口文件，用 / 分隔的相对路径；格式 `^[^\\]*$`；非空 |
| `note` | `string` | 否 |  |
| `createdAt` | `integer` | 是 | ≥ 0 |
| `createdBy` | `{ kind: 'user' \| 'agent' \| 'cli'; agent?: string; command?: string }` | 是 |  |
| `autoClean` | `{ enabled: boolean; days?: integer }` | 是 |  |
| `scriptAutoRun` | `boolean` | 否 | 脚本项目保存后自动运行 |
| `port` | `integer` | 否 | 登记的端口；脚本没有；≥ 1；≤ 65535 |
| `lastUsedAt` | `integer` | 是 | ≥ 0 |
| `lastOpenedAt` | `integer` | 否 | ≥ 0 |
| `missingSince` | `integer` | 否 | 找不到文件夹的起始时间；≥ 0 |

### `RunSnapshot`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `runId` | `string` | 是 | 非空 |
| `playgroundId` | `string` | 是 | 非空 |
| `name` | `string` | 是 | 非空 |
| `kind` | `'server' \| 'static' \| 'oneshot'` | 是 |  |
| `state` | `'checking' \| 'installing' \| 'starting' \| 'ready' \| 'reloading' \| 'running' \| 'stopping' \| 'stopped' \| 'finished' \| 'errored' \| 'crashed' \| 'failed'` | 是 |  |
| `reason` | `'TOOL_MISSING' \| 'TOOL_TOO_OLD' \| 'SETUP_FAILED' \| 'DEPS_OFFLINE' \| 'RUN_FAILED' \| 'RUNTIME_MISSING'` | 否 |  |
| `stale` | `boolean` | 否 | 脚本：语法错误，保留上次输出 |
| `owner` | `Owner` | 是 |  |
| `port` | `integer` | 否 | ≥ 1；≤ 65535 |
| `url` | `string` | 否 | 字面量 127.0.0.1，不写 localhost；以 http://127.0.0.1: 开头 |
| `portFallback` | `{ wanted: integer; reason: 'PORT_OCCUPIED' \| 'PORT_RESERVED'; occupant?: { pid: integer; name: string } }` | 否 |  |
| `pid` | `integer` | 否 | ≥ 0 |
| `exitCode` | `integer` | 否 |  |
| `startedAt` | `integer` | 是 | ≥ 0 |
| `readyMs` | `number` | 否 | ≥ 0 |
| `durationMs` | `number` | 否 | ≥ 0 |
| `idleStopAt` | `integer` | 否 | 只有命令行持有的运行有；≥ 0 |
| `cursor` | `string` | 是 | 当前日志末尾的游标；格式 `^[^:\s]+:\d+$` |
| `alreadyRunning` | `boolean` | 否 | 对活动中的项目再次启动时为 true |

### `Settings`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `libraryRoot` | `string` | 是 | 非空 |
| `externalEditor` | `string` | 否 | 非空 |
| `packageManager` | `'auto' \| 'pnpm' \| 'npm'` | 是 |  |
| `scriptAutoRun` | `boolean` | 是 |  |
| `cliIdleStopMinutes` | `integer` | 是 | > 0 |
| `toolPaths` | `Record<string, string>` | 是 | 工具名到绝对路径 |
| `ports` | `{ min: integer; max: integer }` | 是 | 分配端口的范围，含两端 |
| `urlNewSkipConfirmForBuiltin` | `boolean` | 是 |  |
| `updateCheck` | `boolean` | 是 |  |
