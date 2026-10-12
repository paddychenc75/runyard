# 协议：传输、握手、信封、错误码、版本

管理进程（supervisor）、桌面应用主进程、命令行之间的约定。本篇写“怎么说话”；方法和事件的字段表在 [protocol-methods.md](protocol-methods.md)。形状的唯一出处是 `@runyard/protocol` 里的 zod 定义（实现时），本篇是它的写前说明；两者不一致时以实现并生成的参考文档为准，并修正本篇。

出处：技术设计 §5.1、§5.2、§5.4、§6.8；决策记录 [0005](decisions/0005-supervisor-singleton-handshake.md)、[0002](decisions/0002-supervisor-process.md)。字段级细节另参考了技术设计形成过程中的专家方案，已按技术设计和决策记录修订，两边不一致的地方以后者为准。标“计划”的内容现在还没有对应代码。

## 1. 传输与分帧

| 项 | 约定 | 出处 |
| --- | --- | --- |
| 通道 | 一条本机连接：macOS、Linux 是 Unix socket；对调用方是不透明的地址，Windows 以后用命名管道。不用 HTTP 端口 | §2.3、§5.1 |
| 编码 | UTF-8，一行一个 JSON 对象（NDJSON），以 `\n` 结尾 | §5.1 |
| 单行上限 | 8 MB；超过则断开连接。二进制内容（请求面板的响应体）用 base64 | §5.1 |
| 方向 | 全双工。客户端发请求，管理进程回响应并推送事件 | §5.1 |
| 连接点 | macOS：`~/.runyard/run/supervisor.sock`（目录只有本人可访问）。Windows（以后）：命名管道 `\\.\pipe\runyard-<profile>-<用户标识>`，名字固定。socket 路径不超过 104 字节（macOS 实测上限，Linux 为 108），超了由平台层报明确的错误 | §5.1、0005 |
| 单实例 | macOS、Linux 上先拿 `run/supervisor.lock` 的内核锁，拿到的才许删除残留 socket 文件并监听。算法见 [证据 0005](evidence/0005-supervisor-singleton-handshake.md) | 0005 |
| profile | 区分正式版和开发版，让两者的管理进程、发现文件、管道互不干扰 | §5.1、§8.2 |

## 2. 握手（防冒充，双向质询）

口令是发现文件里的 32 字节随机数，口令不在连接上传输；双方各自证明自己知道它。三条消息的形状永不改变，协议版本放在里面，所以版本比对在握手阶段就能做。伪代码、常量和 16 种冒充做法的实测见证据文件，这里只列字段。

| 步 | 方向 | 消息 | 字段 |
| --- | --- | --- | --- |
| 1 | 管理进程到客户端 | `challenge` | `nonce`（恰好 32 字节随机数）、`protocol`、`minProtocol` |
| 2 | 客户端到管理进程 | `hello` | `clientNonce`（恰好 32 字节）、`proof`、`protocol`、`minProtocol`；身份字段 `client { kind, build, pid }` 见未定 |
| 3 | 管理进程到客户端 | `ready` | `proof`（服务端证明）、其余信息见未定 |

- 客户端证明 = 以口令为密钥，对“固定前缀、`client`、两个 nonce”做 HMAC-SHA256；服务端证明同理，方向标记换成 `server`。两个方向前缀不同，两个 nonce 都必须恰好 32 字节，否则断开（0005）。
- 任何一步不对：断开；客户端报 `SUPERVISOR_UNAVAILABLE`，且不再发送任何请求。
- 没有发现文件（没有口令）：客户端根本不发握手消息，按“管理进程不存在”处理，去启动一个。
- 握手通过之前，管理进程不处理任何其他帧。
- 版本比对在握手之后立即按 §5 的版本表执行；客户端在版本不兼容时不继续发请求（§5.4）。

## 3. 信封

```ts
type Frame =
  | { t: 'req'; id: number; method: string; params: unknown }
  | { t: 'res'; id: number; ok: true; result: unknown }
  | { t: 'res'; id: number; ok: false; error: RunyardError }
  | { t: 'evt'; sub: number; seq: number; event: string; data: unknown };
```

| 规则 | 内容 |
| --- | --- |
| `id` | 客户端在本连接内自增的整数；响应原样带回。同一连接上可以并发多个请求 |
| 订阅 | 事件靠订阅推送：订阅类方法返回 `sub`；同一 `sub` 内 `seq` 递增，用来发现丢失。订阅方法的名字和 `topics` 参数设计没有逐条规定，见未定 |
| 入参校验 | 管理进程用 `protocol` 里的 zod 定义校验每个请求的 `params`，失败返回错误（建议用 `USAGE`，见未定）；开发构建里客户端也校验 `result` |
| 未知字段 | 接收方忽略不认识的字段；未知方法怎么回应见未定 |
| 持有者 | 请求里的 `owner` 由桌面应用主进程补上，界面进程不能自己填（§5.1“界面怎么调用”）；命令行的请求由命令行填 `cli` 持有者 |
| 白名单 | 主进程只转发界面进程白名单内的方法；`supervisor.shutdown` 不在白名单内 |

## 4. 错误、提示、日志条目：只有代码加参数

管理进程一侧不产生给人看的句子（§3.2 规则 7、§6.8）。

```ts
interface RunyardError<C extends ErrorCode = ErrorCode> {
  code: C;        // 稳定的大写下划线代码；不改名、不复用
  params: ...;    // 该代码的参数，只含可序列化的简单值，类型来自登记表
  debug: string;  // 一句英文诊断，只进日志；任何客户端都不许显示
  cause?: { exitCode?: number; signal?: string; outputTail?: string };  // 原始现场，原样显示
}
interface Notice<C extends NoticeCode = NoticeCode> { code: C; params: ... }
type LogEntry =
  | { at: number; kind: 'stdout' | 'stderr' | 'command'; text: string }
  | { at: number; kind: 'system'; notice: Notice };
```

- 登记表在 `protocol` 里各定义一次（错误码、提示码、枚举值），参数用 zod 写；错误码另带退出码（见 [cli-contract.md](cli-contract.md)）。文案键由代码推出：`errors.<代码>.title|body|hint|hintCli`、`notice.<代码>`、`runState.<值>`、`setupStep.<值>`（§5.1 表）。
- 时间 `at` 是 UTC 毫秒数；协议和文件里不存时区。
- `stdout`、`stderr` 的 `text` 是已解码、未清洗的整行（0008）。

### 4.1 错误码（共 26 个，已登记在 `packages/protocol/src/errors.ts`）

| 退出码 | 错误码 | 参数 |
| --- | --- | --- |
| 1 | `INTERNAL` | 无 |
| 2 | `USAGE` | 无 |
| 2 | `NAME_INVALID`、`NAME_RESERVED` | `{ name }` |
| 2 | `VAR_INVALID` | `{ key }` |
| 3 | `PLAYGROUND_NOT_FOUND`、`FOLDER_MISSING` | `{ name }` |
| 3 | `TEMPLATE_NOT_FOUND` | `{ template }` |
| 4 | `TOOL_MISSING` | `{ tool, required }` |
| 4 | `TOOL_TOO_OLD` | `{ tool, required, found }` |
| 4 | `RUNTIME_MISSING` | `{ tool }` |
| 5 | `SETUP_FAILED`、`DEPS_OFFLINE` | `{ name }`；原始现场放 `cause` |
| 6 | `RUN_FAILED`、`SCRIPT_ERRORED` | `{ name }`；原始现场放 `cause` |
| 7 | `READY_TIMEOUT` | `{ name, seconds }` |
| 9 | `NAME_EXISTS`、`BUSY`、`PATH_LOCKED`、`PATH_TOO_LONG`、`TRASH_UNAVAILABLE` | `{ name }` |
| 10 | `APP_REQUIRED`、`SUPERVISOR_UNAVAILABLE`、`CLIENT_OUTDATED`、`NOT_SUPPORTED` | 无 |
| 10 | `SUPERVISOR_OUTDATED` | `{ runs }`（升级会停掉的运行个数，非负整数） |

`name` 是项目名称（命令行传路径时为用户给的原文）；`tool` 是工具标识，由模板的工具定义决定，是开放集合。退出码 8 留给以后的“需要信任”，不占用。`PORT_RESERVED` 不是错误码，只作为端口回退的原因（§5.3）。`TRASH_UNAVAILABLE` 的名字在登记时定下（0010）。

### 4.2 提示码和枚举值

| 类 | 已登记的值 | 出处 |
| --- | --- | --- |
| 提示码 | `RELOADING`、`STOPPED_BY_USER`、`DEPS_FROM_CACHE`、`ENV_DEGRADED`：无参数。`PROCESS_EXITED` `{ exitCode?, signal? }`。`PORT_FALLBACK` `{ wanted, actual, reason }`。`ENV_UNRESOLVED` `{ reason: 'timeout' \| 'failed' }`。`IDLE_STOPPED` `{ minutes }`（空闲自动停止）。`PACKAGE_MANAGER_FALLBACK` `{ wanted, used }`（没有首选的包管理器而改用另一个） | §5.1、§4.8、0009 |
| 运行状态 | `checking` `installing` `starting` `ready` `reloading` `running` `stopping` `stopped` `finished` `errored` `crashed` `failed` | §4.3 |
| 环境来源 | `login-shell`、`login-shell-degraded`、`path-only`、`fallback` | §7.1、0009 |
| 失败原因 | 取自错误码：`TOOL_MISSING` `TOOL_TOO_OLD` `SETUP_FAILED` `DEPS_OFFLINE` `RUN_FAILED` `RUNTIME_MISSING` | §4.3、§4.4 |
| 端口回退原因 | `PORT_OCCUPIED`、`PORT_RESERVED` | §5.3 |

登记表可遍历：`errorRegistry`、`errorCodes`、`noticeRegistry`、`noticeCodes`、`runStates` 等供 `i18n-codes` 检查使用。

## 5. 版本规则

| 规则 | 内容 | 出处 |
| --- | --- | --- |
| 协议版本 | 一个整数。只加新方法、新的可选字段时不变；不兼容时加一 | §5.1 |
| 与产品版本 | 应用、命令行、管理进程用同一个产品版本号；协议版本单独一个整数 | §5.1 |
| 代码稳定 | 错误码、提示码一旦发布，不改名、不复用；新增代码不升协议版本；客户端遇到不认识的代码时显示通用的一句话加 `debug` | §5.1 |
| 构建标识 | 发现文件里记“版本号加构建时生成的随机串”：原地替换 `.app` 后路径照样存在，只看协议版本发现不了“已被换掉” | §5.4 |

连接建立后，按下表处理（§5.4；`shutdown` 的 `ifIdle` 表示“只在没有运行时才退出”）：

| 情况 | 处理 |
| --- | --- |
| 协议版本相同、构建标识相同 | 直接用 |
| 协议版本相同、构建标识不同 | 没有运行：`supervisor.shutdown { ifIdle: true, reason: 'upgrade' }` 后启动自己带的。有运行：沿用，应用提示“停止全部运行后会自动更新”。发现文件里的可执行文件路径不存在是这行的特例 |
| 管理进程较旧，没有运行 | 同上，换新 |
| 管理进程较旧，有运行，且满足客户端要求的最低协议版本 | 兼容使用，应用提示 |
| 管理进程较旧，不满足 | 命令行报 `SUPERVISOR_OUTDATED`，提示 `runyard stop --all`；应用弹窗写明会停掉几个运行，用户确认才做 |
| 管理进程较新，客户端低于它要求的最低版本 | `CLIENT_OUTDATED` |

## 未定（来源没有规定，实现前由规格或决策记录补）

1. 握手三条消息里除 nonce、proof、`protocol`、`minProtocol` 以外的字段：客户端身份（种类 app 或 cli、构建、进程号）放哪条消息；`ready` 里是否返回 `clientId`、`capabilities`、构建标识。
2. 事件订阅的方法名、`topics` 取值、取消订阅的方式（设计只有事件名清单）。
3. 请求面板响应体上限等数值（最初方案为 5 MB 截断），设计未确认。
4. 未知方法返回哪个错误码；单个请求的超时由谁定。
5. 启动步骤枚举（`setupStep.<值>`）的取值：设计只在文案键里提到，没有给出步骤清单，尚未登记。
6. Windows（以后）管道名里“用户标识”的取值方式。
