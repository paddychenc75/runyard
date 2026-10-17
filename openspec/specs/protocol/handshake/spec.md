# handshake Specification

## Purpose

约定客户端（桌面应用主进程、命令行）怎样确认自己连上的是真正的管理进程、怎样比对版本，以及错误怎样表达。目的是让冒充者拿不到口令、版本不一致时不出现半兼容的行为、管理进程一侧永远不产生给人看的句子。字段和消息形状的出处是协议的 zod 定义，这里只写可测的行为。

## Requirements

### Requirement: 处理请求之前先完成双向握手
管理进程和客户端 MUST 在处理任何请求之前完成双向质询握手：服务端先发质询，客户端应答并证明自己知道口令，服务端再证明自己知道口令。口令 MUST NOT 出现在连接上。
来源：PRD #prd-decided-by-default；ADR 0005

#### Scenario: [PROTOCOL-HANDSHAKE-01] 正常握手
- 前提：发现文件存在，里面有口令和连接点
- **WHEN** 客户端连接，收到 `challenge`，回 `hello`，收到 `ready`
- **THEN** 客户端验证服务端证明通过后才发出第一个请求；整个过程中连接上的字节不含口令
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-02] 冒充者不知道口令
- 前提：一个不知道口令的进程占住了连接点，并回出看似合法的 `ready`
- **WHEN** 客户端校验服务端证明
- **THEN** 客户端断开连接，报 `SUPERVISOR_UNAVAILABLE`，不发送任何请求，也没有发送过口令
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-03] 没有发现文件
- 前提：没有发现文件（客户端没有口令）
- **WHEN** 客户端要连接管理进程
- **THEN** 客户端不发任何握手消息，按“管理进程不存在”处理，去启动一个
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-04] nonce 长度不是 32 字节
- **WHEN** 客户端收到长度不是 32 字节的 `nonce`，或服务端收到长度不是 32 字节的 `clientNonce`
- **THEN** 收到的一方立即断开连接，不继续握手
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-05] 空 nonce 加原样回传
- 前提：对方发来空的 `nonce`，并把客户端的应答原样回传
- **WHEN** 客户端处理这次握手
- **THEN** 客户端断开连接并报 `SUPERVISOR_UNAVAILABLE`（空 nonce 被长度检查拒绝；两个方向的固定前缀不同，回传的应答不能当作服务端证明）
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-06] 握手之前不处理请求
- **WHEN** 连接上在握手完成之前就到达了请求帧
- **THEN** 管理进程断开该连接，不处理这个请求
- 验证：test

### Requirement: 按协议版本和构建标识决定怎么用管理进程
握手消息 MUST 携带协议版本和最低版本要求，客户端 MUST 在握手之后立即按版本比对结果处理，且 MUST NOT 在版本不兼容时继续发请求。有运行时、或桌面应用正连着它时，MUST NOT 自动换掉管理进程。
来源：ADR 0005；PRD #prd-decided-by-default

#### Scenario: [PROTOCOL-HANDSHAKE-07] 版本和构建标识都相同
- **WHEN** 两边协议版本相同、构建标识也相同
- **THEN** 客户端直接使用这个管理进程
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-08] 构建标识不同且没有运行
- 前提：协议版本相同，构建标识不同（例如应用文件被原地替换），管理进程没有任何运行，也没有桌面应用连着它
- **WHEN** 客户端比对版本
- **THEN** 客户端发 `supervisor.shutdown { ifIdle: true, reason: 'upgrade' }`，等它退出后启动自己带的管理进程
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-09] 构建标识不同且有运行
- 前提：协议版本相同，构建标识不同，管理进程有运行
- **WHEN** 客户端比对版本
- **THEN** 客户端沿用旧的管理进程，不停止任何运行，并向应用提供“后台管理进程是旧版本，停止全部运行后会自动更新”的提示信息
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-10] 发现文件里的可执行文件已不存在
- 前提：发现文件记录的可执行文件路径指向的文件已被删除
- **WHEN** 客户端比对版本
- **THEN** 按“构建标识不同”处理（没有运行就换新，有运行就沿用并提示）
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-11] 管理进程较旧且没有运行
- 前提：没有桌面应用连着管理进程
- **WHEN** 管理进程的协议版本低于客户端，且没有任何运行
- **THEN** 客户端发 `supervisor.shutdown { ifIdle: true, reason: 'upgrade' }`，等它退出后启动自己带的新版
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-12] 管理进程较旧、有运行、仍满足客户端的最低要求
- **WHEN** 管理进程较旧并有运行，但它的协议版本不低于客户端要求的最低版本
- **THEN** 客户端以兼容方式继续使用，不停止任何运行
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-13] 管理进程较旧、有运行、不满足最低要求
- **WHEN** 管理进程较旧并有运行，且它的协议版本低于客户端要求的最低版本
- **THEN** 客户端报 `SUPERVISOR_OUTDATED`，参数带“会停掉的运行个数”，命令行退出码为 10，不继续发请求；命令行的提示是 `runyard stop --all`
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-14] 管理进程较新、客户端低于它的最低要求
- **WHEN** 客户端的协议版本低于管理进程要求的最低版本
- **THEN** 客户端报 `CLIENT_OUTDATED`，命令行退出码为 10，不继续发请求
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-21] 桌面应用连着，管理进程没有运行，仍满足最低要求
- 前提：桌面应用连着管理进程，管理进程没有任何运行；命令行的构建标识与管理进程的不同，协议版本满足命令行要求的最低版本
- **WHEN** 命令行比对版本，并发 `supervisor.shutdown { ifIdle: true, reason: 'upgrade' }`
- **THEN** 管理进程回 `closing: false`、不退出，应用的连接照常可用；命令行沿用这个管理进程，向用户说明“应用正在使用它，没有换新”，不报错
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-22] 桌面应用连着，管理进程没有运行，不满足最低要求
- 前提：桌面应用连着管理进程，管理进程没有任何运行，它的协议版本低于命令行要求的最低版本
- **WHEN** 命令行比对版本，管理进程拒绝被换新
- **THEN** 命令行报 `SUPERVISOR_OUTDATED`，参数 `runs` 为 0，退出码 10，不继续发请求；提示写明是桌面应用在使用旧的管理进程，退出应用后重试，不是 `runyard stop --all`
- 验证：test

### Requirement: 错误只有代码加参数
`core`、`supervisor`、`client`、`platform`、`protocol` MUST NOT 产生给人看的句子。错误 MUST 只由稳定的 `code`、带类型的 `params`、一句只进日志的英文 `debug`、可选的原始现场 `cause` 组成；任何客户端 MUST NOT 显示 `debug`。
来源：PRD #prd-cli-language；PRD #prd-cli-json

#### Scenario: [PROTOCOL-HANDSHAKE-15] 名称冲突的错误形状
- 前提：已有名为 `demo` 的项目
- **WHEN** 请求创建名为 `demo` 的项目
- **THEN** 响应为 `ok: false`，`error.code` 是 `NAME_EXISTS`，`error.params` 是 `{ name: 'demo' }`，错误里没有面向用户的句子字段
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-16] 登记表里没有句子
- **WHEN** 遍历协议登记的全部错误码、提示码及其参数定义
- **THEN** 没有任何一个定义含 `message`、`hint` 这类面向用户的文字字段；每个错误码都有对应的退出码
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-17] 客户端遇到不认识的错误码
- 前提：新版管理进程返回了旧版客户端没有登记的错误码
- **WHEN** 客户端处理这个错误
- **THEN** 客户端显示通用的一句话并附原始 `code`，`debug` 只写日志；协议版本不因新增错误码而升级
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-18] 已发布的错误码不改名不复用
- **WHEN** 对照上一次发布的错误码和提示码清单
- **THEN** 清单里的每个代码都仍然存在且含义不变；只允许新增
- 验证：test

### Requirement: 帧的大小与未知字段
一行 JSON 的上限 MUST 是 8 MB，超过的连接 MUST 被关闭而不使管理进程崩溃。接收方 MUST 忽略不认识的字段，新增方法或可选字段 MUST NOT 升级协议版本。
来源：ADR 0005；PRD #prd-decided-by-default

#### Scenario: [PROTOCOL-HANDSHAKE-19] 超过 8 MB 的一行
- **WHEN** 一个连接发来超过 8 MB 的单行
- **THEN** 管理进程关闭该连接，其他连接和运行不受影响
- 验证：test

#### Scenario: [PROTOCOL-HANDSHAKE-20] 请求里有不认识的字段
- **WHEN** 请求的 `params` 里多了一个当前版本不认识的可选字段
- **THEN** 请求照常处理，多余字段被忽略
- 验证：test
