# commands Specification

## Purpose

约定命令行 `runyard` 的 P0 命令各自做什么、`--json` 输出有哪些键、退出码怎样对应错误码、提示语言怎样选、管理进程和桌面应用没有运行时怎么办，以及怎样记录“是哪个智能体创建的”。命令行是非交互的，智能体读 `--json`，人读默认输出。命令行只随桌面应用安装，第一版不发 npm；M1 期间从仓库源码运行。握手和版本比对在 protocol/handshake，管理进程的启动在 supervisor/lifecycle，运行、停止、日志、端口的细节分别在 run/lifecycle、run/logs、run/ports；模板命令背后的规则在 templates/format 与 templates/custom。`open`、`screenshot`、`prune`、`exec`、`template add|update|remove`、`mcp` 不在 M1。

## Requirements

### Requirement: 命令行始终非交互，`--json` 只输出一个对象
命令行 MUST NOT 提问，MUST NOT 等待标准输入。带 `--json` 时，标准输出上 MUST 恰好是一个 JSON 对象：结果，或 `{"error": {...}}`；其中的路径 MUST 是绝对路径，本机地址 MUST 是字面量 `127.0.0.1`，MUST NOT 出现 `localhost`。唯一的例外是 `logs --follow --json`，见该命令。错误对象 MUST 含 `code`、`message`、`hint`、`data`，有原始现场时再含 `cause`；`data` 就是错误码登记的参数；`message` 与 `hint` MUST 是英文，`hint` MUST 写明下一步该执行的完整命令。`--json` 模式下进度、警告 MUST NOT 写到标准输出；结果里的提示 MUST 放在 `notices` 数组里（元素是 `{ "code", "params" }`，没有提示时不出现这个键）。`--quiet` MUST NOT 改变 `--json` 的输出和退出码。
来源：PRD #prd-cli-json；PRD #prd-cli-language；PRD #prd-cli

#### Scenario: [CLI-COMMANDS-01] 成功时恰好一个对象
- **WHEN** 执行 `runyard status --json`
- **THEN** 标准输出能整体解析为一个 JSON 对象，没有其他字符；退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-02] 出错时恰好一个错误对象
- **WHEN** 执行 `runyard run no-such-project --json`
- **THEN** 标准输出是一个 JSON 对象，只有一个顶层键 `error`，其中 `code` 是 `PLAYGROUND_NOT_FOUND`，`data` 是 `{ "name": "no-such-project" }`，`message` 与 `hint` 是非空英文；退出码 3
- 验证：test

#### Scenario: [CLI-COMMANDS-03] hint 写明下一步命令
- 前提：项目需要 Go，本机没有
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 错误码 `TOOL_MISSING`，`hint` 里含完整的 `runyard run demo`；同样，`TOOL_TOO_OLD`、`SETUP_FAILED`、`DEPS_OFFLINE`、`RUN_FAILED`、`SCRIPT_ERRORED`、`READY_TIMEOUT`、`NAME_EXISTS` 的 `hint` 都含以 `runyard ` 开头的完整命令
- 验证：test

#### Scenario: [CLI-COMMANDS-04] 路径和地址的写法
- 前提：一个 `ready` 的服务项目
- **WHEN** 执行 `runyard status --json`
- **THEN** 所有 `path` 以 `/` 开头；所有 `url` 以 `http://127.0.0.1:` 开头；输出里没有 `localhost`
- 验证：test

#### Scenario: [CLI-COMMANDS-05] 不提问、不读标准输入
- 前提：标准输入是一个永不结束的管道
- **WHEN** 执行任何 P0 命令，缺少必需的参数
- **THEN** 命令立即以 `USAGE`、退出码 2 结束，没有等待输入
- 验证：test

#### Scenario: [CLI-COMMANDS-06] 提示放进 notices
- 前提：项目路径接近系统路径长度上限
- **WHEN** 执行 `runyard new react19 demo --json`
- **THEN** 结果里有 `notices`，其中一项是 `{ "code": "PATH_NEAR_LIMIT", "params": {...} }`；标准输出仍然只有这一个对象
- 验证：test

#### Scenario: [CLI-COMMANDS-07] --quiet 不改变 --json
- **WHEN** 分别执行 `runyard status --json` 和 `runyard status --json --quiet`
- **THEN** 两次标准输出逐字相同，退出码相同
- 验证：test

### Requirement: 退出码严格按错误码登记表
命令行的退出码 MUST 取自协议错误码登记表中该错误码的退出码，MUST NOT 另有一套：0 成功；1 `INTERNAL`；2 用法错误；3 未找到；4 缺少运行环境；5 安装依赖失败；6 就绪前退出或脚本出错；7 超时；9 冲突；10 环境问题。退出码 8 MUST NOT 使用。未知的命令、未知的参数、缺少参数 MUST 报 `USAGE`（2）。没有预料到的异常 MUST 报 `INTERNAL`（1），带 `--json` 时同样输出错误对象。
来源：PRD #prd-cli-json；PRD #prd-cli-commands

#### Scenario: [CLI-COMMANDS-08] 每个错误码的退出码与登记表一致
- **WHEN** 对登记表里的每一个错误码，让命令行以该错误码失败
- **THEN** 进程退出码等于登记表里该错误码的退出码；没有任何错误码返回 8
- 验证：test

#### Scenario: [CLI-COMMANDS-09] 未知命令和参数
- **WHEN** 执行 `runyard frobnicate`、`runyard run demo --nope`、`runyard run`
- **THEN** 三条都报 `USAGE`，退出码 2
- 验证：test

#### Scenario: [CLI-COMMANDS-10] 意外异常
- 前提：测试里让某条命令内部抛出未预料的异常
- **WHEN** 执行 `runyard status --json`
- **THEN** 标准输出是 `{"error": {...}}`，`code` 是 `INTERNAL`；退出码 1；错误里不含堆栈
- 验证：test

### Requirement: 提示语言只有英文和简体中文，默认英文
给人看的输出和 `--help` MUST 有 `en` 和 `zh-CN` 两份。默认 MUST 是英文，在任何系统上都是，MUST NOT 读取 `LANG` 等系统语言。切换的优先级从高到低 MUST 是：单条命令的 `--lang`；环境变量 `RUNYARD_LANG`；`runyard config set lang` 写下的设置；英文。不认识的值 MUST 退回英文，并在标准错误上输出一行英文提示，MUST NOT 污染标准输出。`--json` 的输出 MUST 不受语言影响：同一条命令在两种语言下的 `--json` 输出 MUST 逐字相同，`message` 与 `hint` 永远是英文。`--lang` 和环境变量 MUST NOT 写入设置文件。命令行与桌面应用的语言 MUST 互不影响。
来源：PRD #prd-cli-language；PRD #prd-cli-json；PRD #prd-quality

#### Scenario: [CLI-COMMANDS-11] 默认英文且不跟随系统
- 前提：环境变量 `LANG` 为 `zh_CN.UTF-8`，没有设置 `RUNYARD_LANG`，没有 `cli.json`
- **WHEN** 执行 `runyard run no-such-project`
- **THEN** 错误信息是英文
- 验证：test

#### Scenario: [CLI-COMMANDS-12] 优先级
- 前提：`cli.json` 里 `lang` 是 `zh-CN`，环境变量 `RUNYARD_LANG` 是 `en`
- **WHEN** 分别执行不带 `--lang` 的命令，和带 `--lang zh-CN` 的命令
- **THEN** 第一次是英文（环境变量盖过设置），第二次是中文（参数盖过环境变量）
- 验证：test

#### Scenario: [CLI-COMMANDS-13] 不认识的语言值
- **WHEN** 执行 `runyard status --lang fr --json`
- **THEN** 输出按英文；标准错误上有一行英文提示说明 `fr` 不被支持；标准输出仍只有一个 JSON 对象
- 验证：test

#### Scenario: [CLI-COMMANDS-14] --json 在两种语言下逐字相同
- 前提：同一个资源库状态
- **WHEN** 分别用 `--lang en` 和 `--lang zh-CN` 执行 `status --json`、`run no-such-project --json`、`template list --json`
- **THEN** 每一对的标准输出逐字相同
- 验证：test

#### Scenario: [CLI-COMMANDS-15] --help 有两份
- **WHEN** 分别用英文和中文执行 `runyard --help` 和每个子命令的 `--help`
- **THEN** 输出与各自语言的快照一致；命令名和参数名在两份里相同，没有被翻译
- 验证：test

#### Scenario: [CLI-COMMANDS-16] --lang 与环境变量不写设置
- **WHEN** 执行 `runyard status --lang zh-CN`，并在环境变量 `RUNYARD_LANG=zh-CN` 下执行一次
- **THEN** `cli.json` 没有被创建或修改
- 验证：test

### Requirement: `config` 只有一个设置项 `lang`
`runyard config set lang <locale>` MUST 把 `en` 或 `zh-CN` 写入 `cli.json`；值不是这两个时 MUST 报 `USAGE` 且不写文件。`runyard config get lang` MUST 返回当前生效的语言和它的来源（`flag`、`env`、`saved`、`default` 之一）。`config` 的其他键 MUST 报 `USAGE`。`config` MUST NOT 需要管理进程。
来源：PRD #prd-cli-language

#### Scenario: [CLI-COMMANDS-17] 设置并读取
- **WHEN** 执行 `runyard config set lang zh-CN --json`，再执行 `runyard config get lang --json`
- **THEN** 前者返回 `{ "lang": "zh-CN" }`；后者返回 `{ "lang": "zh-CN", "source": "saved" }`；`cli.json` 里 `lang` 是 `zh-CN`
- 验证：test

#### Scenario: [CLI-COMMANDS-18] 来源随优先级变化
- 前提：`cli.json` 里 `lang` 是 `zh-CN`
- **WHEN** 带 `RUNYARD_LANG=en` 执行 `config get lang --json`
- **THEN** 返回 `{ "lang": "en", "source": "env" }`
- 验证：test

#### Scenario: [CLI-COMMANDS-19] 非法的值和键
- **WHEN** 执行 `runyard config set lang fr`，以及 `runyard config set theme dark`
- **THEN** 都报 `USAGE`，退出码 2，`cli.json` 没有变化
- 验证：test

### Requirement: 管理进程和桌面应用没有运行时的行为
命令行连不上管理进程时 MUST 自己启动它再继续（连接、握手、版本比对由 client 负责）；P0 命令 MUST NOT 要求桌面应用在运行，MUST NOT 拉起桌面应用。`config`、`skill install`、`template lint`、`template test`、`--help` MUST NOT 需要管理进程。管理进程连不上也启动不了时 MUST 报 `SUPERVISOR_UNAVAILABLE`，退出码 10。`doctor` 在管理进程连不上时 MUST 照常输出其余诊断信息，并在结果里写明管理进程不可用，MUST NOT 因此失败。
来源：PRD #prd-cli-json；PRD #prd-cli-distribution；PRD #prd-decided-by-default

#### Scenario: [CLI-COMMANDS-20] 没有管理进程时自动启动
- 前提：没有管理进程在运行，也没有桌面应用
- **WHEN** 执行 `runyard new html demo --run --json`
- **THEN** 管理进程被启动，项目被创建并运行；桌面应用没有被启动
- 验证：test

#### Scenario: [CLI-COMMANDS-21] 管理进程启动不了
- 前提：测试里让管理进程的启动失败
- **WHEN** 执行 `runyard status --json`
- **THEN** 错误码 `SUPERVISOR_UNAVAILABLE`，退出码 10；`hint` 里含 `runyard doctor`
- 验证：test

#### Scenario: [CLI-COMMANDS-22] 不需要管理进程的命令
- 前提：管理进程启动被禁止
- **WHEN** 执行 `runyard config get lang`、`runyard skill install --target claude`、`runyard template lint <模板>`、`runyard --help`
- **THEN** 全部成功，没有尝试连接或启动管理进程
- 验证：test

#### Scenario: [CLI-COMMANDS-23] doctor 在管理进程不可用时
- 前提：管理进程连不上也启动不了
- **WHEN** 执行 `runyard doctor --json`
- **THEN** 退出码 0；结果的 `supervisor` 是 `{ "running": false, "reason": ... }`，其余部分（`cli`、`tools`、`library`、`system`）仍然有
- 验证：test

### Requirement: `new` 创建项目，可选启动并等待
`runyard new <template> [name]` MUST 用模板创建项目；不给名称时 MUST 按“模板标识加序号”命名。`--note` MUST 写入备注；`--clean-after <N>d` 的规则见 library/auto-clean；`--var k=v` MUST 对 `{{k}}` 做字面替换，键未在模板里声明、值缺失、写法不是 `k=v`、或键为 `name`（名称已由项目名提供）时 MUST 报 `VAR_INVALID`；`--if-exists reuse|fail` 的行为见 library/playgrounds，不给时 MUST 按 `fail`。`--run` MUST 在创建后启动并等待：服务等到就绪，脚本等到退出；`--no-wait` MUST 在启动请求被接受后立即返回，不等就绪。`--timeout <秒>` MUST 只决定本次调用等多久，到点服务仍未就绪时 MUST 报 `READY_TIMEOUT`，进程 MUST 继续运行。模板不存在 MUST 报 `TEMPLATE_NOT_FOUND`。创建成功而启动失败时，项目 MUST 保留并可编辑。
来源：PRD #prd-cli；PRD #prd-cli-json；PRD #prd-naming；PRD #prd-note；PRD #prd-template-engineering

#### Scenario: [CLI-COMMANDS-24] 创建并启动服务
- **WHEN** 执行 `runyard new react19 pricing-table --run --note "pricing table layout test" --json`
- **THEN** 结果含 `id`、`name`、`path`、`template`、`created: true`、`entry`、`retention: "kept"`，以及 `run` 对象；`run` 含 `runId`、`state: "ready"`、`kind: "server"`、`url`、`port`、`readyMs`、`alreadyRunning: false`、`owner: "cli"`、`idleStopMinutes`、`logTail`、`cursor`；退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-25] 创建并运行脚本
- **WHEN** 执行 `runyard new python hello --run --json`
- **THEN** `run` 对象含 `runId`、`state: "finished"`、`kind: "oneshot"`、`exitCode: 0`、`durationMs`、`stale: false`、`alreadyRunning: false`、`output`、`truncated`、`cursor`，没有 `url`、`port`
- 验证：test

#### Scenario: [CLI-COMMANDS-26] 只创建不运行
- **WHEN** 执行 `runyard new react19 demo --json`
- **THEN** 结果里没有 `run` 键；没有启动任何进程
- 验证：test

#### Scenario: [CLI-COMMANDS-27] 不等待
- **WHEN** 执行 `runyard new react19 demo --run --no-wait --json`
- **THEN** 命令立即返回，`run.state` 不是 `ready`，没有 `readyMs`；之后服务自己继续走到 `ready`
- 验证：test

#### Scenario: [CLI-COMMANDS-28] 等待超时但进程继续
- 前提：服务要 5 秒才就绪
- **WHEN** 执行 `runyard new react19 demo --run --timeout 1 --json`
- **THEN** 错误码 `READY_TIMEOUT`，`data` 含 `name` 和 `seconds`，退出码 7；项目已创建，服务进程继续运行，没有被杀
- 验证：test

#### Scenario: [CLI-COMMANDS-29] 模板不存在
- **WHEN** 执行 `runyard new nope demo --json`
- **THEN** 错误码 `TEMPLATE_NOT_FOUND`，`data` 是 `{ "template": "nope" }`，退出码 3；没有创建文件夹
- 验证：test

#### Scenario: [CLI-COMMANDS-30] 变量
- 前提：模板声明了变量 `title`
- **WHEN** 执行 `runyard new <模板> demo --var title=Hello`，再用 `--var color=red`、`--var title`、`--var name=x` 各创建一次
- **THEN** 第一次把文件里的 `{{title}}` 原样替换为 `Hello`；后三次都报 `VAR_INVALID`，退出码 2，`data.key` 分别是 `color`、`title`、`name`，没有创建文件夹
- 验证：test

#### Scenario: [CLI-COMMANDS-31] 已存在时默认失败
- 前提：已有名为 `demo` 的项目
- **WHEN** 执行 `runyard new react19 demo --json`
- **THEN** 错误码 `NAME_EXISTS`，退出码 9，`hint` 里提到 `--if-exists reuse`；已有项目不变
- 验证：test

#### Scenario: [CLI-COMMANDS-32] 创建后启动失败
- 前提：模板需要的工具本机没有
- **WHEN** 执行 `runyard new go hello --run --json`
- **THEN** 错误码 `TOOL_MISSING`，退出码 4；项目文件夹已存在、可以编辑
- 验证：test

### Requirement: 创建者记录
命令行创建项目时 MUST 记录创建者：智能体名称取环境变量 `RUNYARD_AGENT`；没有时，已知智能体自己的环境变量也算，`CLAUDECODE` 为 `1` 记为 `Claude Code`，`AI_AGENT` 有值时取其原值；这些都没有时，创建者种类 MUST 是 `cli` 且不带智能体名。命令行持有的运行 MUST 带同一个智能体名。创建命令 MUST 随创建者一起记入项目，创建时间也一并记入。
来源：PRD #prd-cli-creator；PRD #prd-agent-created

#### Scenario: [CLI-COMMANDS-33] RUNYARD_AGENT 优先
- 前提：`RUNYARD_AGENT` 为 `My Agent`，同时 `CLAUDECODE` 为 `1`
- **WHEN** 执行 `runyard new html demo --note "x"`
- **THEN** `playground.json` 里创建者种类是 `agent`、名字是 `My Agent`，并记下创建命令和创建时间
- 验证：test

#### Scenario: [CLI-COMMANDS-34] 已知智能体的环境变量
- 前提：没有 `RUNYARD_AGENT`，`CLAUDECODE` 为 `1`
- **WHEN** 创建项目
- **THEN** 创建者是智能体 `Claude Code`
- 验证：test

#### Scenario: [CLI-COMMANDS-35] 跨工具约定名
- 前提：没有 `RUNYARD_AGENT` 和 `CLAUDECODE`，`AI_AGENT` 为 `codex/1.2`
- **WHEN** 创建项目
- **THEN** 创建者是智能体，名字是 `codex/1.2`
- 验证：test

#### Scenario: [CLI-COMMANDS-36] 没有任何标记
- 前提：以上环境变量都没有
- **WHEN** 创建项目
- **THEN** 创建者种类是 `cli`，没有智能体名
- 验证：test

#### Scenario: [CLI-COMMANDS-37] 运行也带智能体名
- 前提：`RUNYARD_AGENT` 为 `Claude Code`
- **WHEN** 执行 `runyard run demo --json`，再执行 `runyard status --json`
- **THEN** 该运行在 `status` 里 `owner` 是 `"cli"`、`agent` 是 `"Claude Code"`，`createdBy` 是 `{ "kind": "agent", "agent": "Claude Code" }`
- 验证：test

### Requirement: `run` 启动并等待，重复启动返回现有运行
`runyard run <pg>` 的 `<pg>` MUST 接受项目名称或项目文件夹的绝对路径。服务 MUST 等到就绪才返回，脚本 MUST 等到退出才返回；`--timeout <秒>` 默认 60，到点未完成 MUST 报 `READY_TIMEOUT`（7），进程 MUST 继续运行；`--no-wait` MUST 在请求被接受后立即返回。对活动中的项目 MUST 返回现有运行并带 `alreadyRunning: true`；唯一的例外是正处于 `stopping` 的项目：这时 MUST 先等这次停止完成，再起一次新的运行（`alreadyRunning` 为 `false`，`runId` 是新的），而不是返回那次马上要结束的运行；停止在停止本身的时限内（见 run/lifecycle 的停止要求）仍没有完成时，MUST 报 `BUSY`（9）；`--restart` MUST 先停止再启动，端口不变，`alreadyRunning` 为 `false`；`--port <n>` MUST 只用于这一次，且指定的端口被占用时 MUST 报 `PORT_IN_USE`（9）、不启动、不换端口（见 run/ports）。项目不存在 MUST 报 `PLAYGROUND_NOT_FOUND`，文件夹找不到 MUST 报 `FOLDER_MISSING`。端口被占用改用别的端口时，结果 MUST 带 `portFallback`，这不是错误。服务的结果 MUST 含 `runId`、`name`、`state`、`kind`、`url`、`port`、`readyMs`、`alreadyRunning`、`owner`、`idleStopMinutes`、`logTail`、`cursor`；脚本的结果 MUST 含 `runId`、`name`、`state`、`kind`、`exitCode`、`durationMs`、`stale`、`alreadyRunning`、`output`、`truncated`、`cursor`。
来源：PRD #prd-cli-json；PRD #prd-run；PRD #prd-ports；PRD #prd-script-projects

#### Scenario: [CLI-COMMANDS-38] 脚本等到退出
- 前提：脚本打印 `Hello` 后以 0 退出
- **WHEN** 执行 `runyard run hello-py --json`
- **THEN** 结果 `state: "finished"`、`kind: "oneshot"`、`exitCode: 0`、`output` 为 `"Hello\n"`、`truncated: false`、`stale: false`；退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-39] 脚本以非零退出
- 前提：脚本以退出码 1 退出
- **WHEN** 执行 `runyard run hello-py --json`
- **THEN** 错误码 `SCRIPT_ERRORED`，退出码 6，`cause.exitCode` 是 1，`cause.outputTail` 带输出末尾
- 验证：test

#### Scenario: [CLI-COMMANDS-40] 重复运行
- 前提：项目已是 `ready`
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 返回同一个 `runId`，`alreadyRunning: true`
- 验证：test

#### Scenario: [CLI-COMMANDS-41] 重启
- 前提：服务在端口 7104 `ready`
- **WHEN** 执行 `runyard run demo --restart --json`
- **THEN** 旧进程树被结束，新的运行在同一端口 `ready`，`alreadyRunning: false`，`runId` 与旧的不同
- 验证：test

#### Scenario: [CLI-COMMANDS-42] 端口被占用时改用别的端口
- 前提：登记的端口 7104 被另一个程序占着
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 结果的 `port` 不是 7104，带 `portFallback: { "wanted": 7104, "reason": "PORT_OCCUPIED", ... }`；退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-43] 按路径运行
- **WHEN** 执行 `runyard run /绝对路径/到/demo --json`
- **THEN** 与按名称运行等价
- 验证：test

#### Scenario: [CLI-COMMANDS-44] 文件夹找不到
- 前提：项目的文件夹被移走
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 错误码 `FOLDER_MISSING`，退出码 3
- 验证：test

#### Scenario: [CLI-COMMANDS-45] 等待超时
- 前提：服务启动时间超过 `--timeout`
- **WHEN** 执行 `runyard run demo --timeout 1 --json`
- **THEN** 错误码 `READY_TIMEOUT`，退出码 7；服务进程仍在运行
- 验证：test

#### Scenario: [CLI-COMMANDS-46] 运行算一次使用
- 前提：自动清理的项目
- **WHEN** 执行 `runyard run demo`
- **THEN** 它的上次使用时间更新（规则见 library/auto-clean）
- 验证：test

#### Scenario: [CLI-COMMANDS-78] 停止中的项目再次运行
- 前提：服务正处于 `stopping`
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 命令等这次停止完成后再起新的运行；结果的 `runId` 与正在停止的那次不同，`alreadyRunning: false`；任何时刻只有一个进程树存活
- 验证：test

#### Scenario: [CLI-COMMANDS-79] 停止超过时限仍未完成
- 前提：假平台让停止一直不完成，超过停止的时限
- **WHEN** 执行 `runyard run demo --json`
- **THEN** 错误码 `BUSY`，退出码 9；没有起新的进程
- 验证：test

### Requirement: `stop` 停止运行
`runyard stop <pg>` MUST 停止该项目的运行；`runyard stop --all` MUST 停止所有运行，带 `--mine` 时只停命令行持有的。结果 MUST 是 `{ "stopped": [ { "runId", "name" } ] }`；没有运行可停时 MUST 成功并返回空数组。同时给 `<pg>` 和 `--all`、两者都没给、`--mine` 不带 `--all`，MUST 报 `USAGE`。返回之前进程树 MUST 已空。
来源：PRD #prd-stop；PRD #prd-run-ownership；PRD #prd-cli-commands

#### Scenario: [CLI-COMMANDS-47] 停止一个项目
- 前提：项目 `ready`
- **WHEN** 执行 `runyard stop demo --json`
- **THEN** 结果 `{ "stopped": [ { "runId": "...", "name": "demo" } ] }`，端口可重新绑定
- 验证：test

#### Scenario: [CLI-COMMANDS-48] 没有运行也成功
- 前提：项目没有运行
- **WHEN** 执行 `runyard stop demo --json`
- **THEN** 结果 `{ "stopped": [] }`，退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-49] 全部停止与只停自己的
- 前提：一个标签页持有的运行和两个命令行持有的运行
- **WHEN** 执行 `runyard stop --all --mine --json`
- **THEN** `stopped` 里只有两个命令行持有的；标签页持有的仍在运行
- 验证：test

#### Scenario: [CLI-COMMANDS-50] 参数组合不对
- **WHEN** 执行 `runyard stop`、`runyard stop demo --all`、`runyard stop --mine`
- **THEN** 三条都报 `USAGE`，退出码 2，没有任何运行被停止
- 验证：test

### Requirement: `status` 列出项目和运行状态
`runyard status [pg]` MUST 返回 `{ "running": N, "playgrounds": [...] }`，`running` 是管理进程计算的“运行中”数量；`--running` MUST 只列有活动运行的项目；给 `<pg>` 时只列这一个。每一项 MUST 含这些键，不适用时值为 `null`：`id`、`name`、`path`、`template`、`kind`、`state`、`url`、`port`、`owner`、`agent`、`idleStopAt`、`retention`、`cleanInDays`、`note`、`createdBy`、`lastUsedAt`、`missing`。从未运行过的项目 `state` MUST 是 `"stopped"`。`retention` MUST 是 `"kept"` 或 `"autoClean"`，后者的 `cleanInDays` 是距离到期的整天数。找不到文件夹的项目 `missing` MUST 为 `true`，MUST NOT 使命令失败。
来源：PRD #prd-cli-json；PRD #prd-run-view；PRD #prd-agent-created

#### Scenario: [CLI-COMMANDS-51] 完整的键
- 前提：一个命令行创建、`ready` 的服务
- **WHEN** 执行 `runyard status --json`
- **THEN** `running` 为 1；该项目含上面列出的全部键，`owner` 是 `"cli"`，`idleStopAt` 有值，`retention` 是 `"kept"`，`cleanInDays` 是 `null`，`missing` 是 `false`
- 验证：test

#### Scenario: [CLI-COMMANDS-52] 未运行的项目与自动清理的项目
- 前提：一个从未运行的、自动清理 30 天的项目，刚创建
- **WHEN** 执行 `runyard status <名称> --json`
- **THEN** `playgrounds` 只有这一项；`state` 是 `"stopped"`，`owner`、`url` 是 `null`，`retention` 是 `"autoClean"`，`cleanInDays` 是 30
- 验证：test

#### Scenario: [CLI-COMMANDS-53] 只看运行中的
- 前提：两个项目，一个 `ready`，一个没运行
- **WHEN** 执行 `runyard status --running --json`
- **THEN** `playgrounds` 只有 `ready` 的那个
- 验证：test

#### Scenario: [CLI-COMMANDS-54] 找不到文件夹的项目
- 前提：一个项目的文件夹被移走
- **WHEN** 执行 `runyard status --json`
- **THEN** 命令成功；该项目 `missing` 为 `true`
- 验证：test

### Requirement: `logs` 读取日志
`runyard logs <pg>` MUST 默认返回清洗后的纯文本的最后 200 行，`--raw` MUST 原样返回；`--tail <n>` MUST 改变行数；`--since <游标>` MUST 只返回游标之后的新内容。结果 MUST 含 `text`、`lines`、`cursor`、`state`、`truncated`；项目从没运行过时 `text` 为空，`lines` 为 0，`cursor` 和 `state` 为 `null`。`--follow` MUST 持续输出新内容，直到该运行进入 `finished`、`errored`、`failed`、`crashed` 或 `stopped`，或进程被中断；`--follow --json` MUST 每行输出一个对象（含 `text`、`cursor`、`state`），最后一行 MUST 是 `{ "end": true, "cursor": ... }`。游标的细节见 run/logs。
来源：PRD #prd-cli-json；PRD #prd-cli-language；技术设计 §4.5

#### Scenario: [CLI-COMMANDS-55] 默认返回最后 200 行
- 前提：运行输出了 500 行
- **WHEN** 执行 `runyard logs demo --json`
- **THEN** `lines` 为 200，`truncated` 为 `true`，`text` 不含颜色码
- 验证：test

#### Scenario: [CLI-COMMANDS-56] 只读新内容
- 前提：上一次读到的游标是 `r_8f3a:12`，之后又输出了一行
- **WHEN** 执行 `runyard logs demo --since r_8f3a:12 --json`
- **THEN** `lines` 为 1，`cursor` 是新的游标
- 验证：test

#### Scenario: [CLI-COMMANDS-57] --raw 保留控制序列
- 前提：输出里有颜色码
- **WHEN** 分别执行带和不带 `--raw` 的 `logs`
- **THEN** 带 `--raw` 的输出里还有颜色码，不带的没有
- 验证：test

#### Scenario: [CLI-COMMANDS-58] 从没运行过
- **WHEN** 对从没运行过的项目执行 `runyard logs demo --json`
- **THEN** `{ "text": "", "lines": 0, "cursor": null, "state": null, "truncated": false }`，退出码 0
- 验证：test

#### Scenario: [CLI-COMMANDS-59] 跟随到结束
- 前提：一个脚本项目，运行中陆续输出两行后结束
- **WHEN** 执行 `runyard logs hello-py --follow --json`
- **THEN** 标准输出每行是一个 JSON 对象，最后一行是 `{ "end": true, "cursor": "..." }`，之后命令以退出码 0 结束
- 验证：test

### Requirement: `rm` 先停止再移到废纸篓
`runyard rm <pg>` MUST 先停止运行，再只通过平台层移到废纸篓；MUST NOT 提问确认，MUST NOT 永久删除。结果 MUST 是 `{ "name", "path", "trashed": true }`。放不进废纸篓 MUST 报 `TRASH_UNAVAILABLE`（9），文件夹被占用 MUST 报 `PATH_LOCKED`（9），项目不存在 MUST 报 `PLAYGROUND_NOT_FOUND`，文件夹找不到 MUST 报 `FOLDER_MISSING`；失败时项目文件夹 MUST 原样保留。
来源：PRD #prd-retention；PRD #prd-cli-commands

#### Scenario: [CLI-COMMANDS-60] 移到废纸篓
- 前提：项目正在运行
- **WHEN** 执行 `runyard rm demo --json`
- **THEN** 结果含 `name`、绝对 `path`、`trashed: true`；运行已停止，文件夹在废纸篓里，资源库里没有它
- 验证：test

#### Scenario: [CLI-COMMANDS-61] 放不进废纸篓
- 前提：假平台让 `fs.trash` 失败
- **WHEN** 执行 `runyard rm demo --json`
- **THEN** 错误码 `TRASH_UNAVAILABLE`，退出码 9；文件夹原样在资源库里
- 验证：test

#### Scenario: [CLI-COMMANDS-62] 不存在的项目
- **WHEN** 执行 `runyard rm nope --json`
- **THEN** 错误码 `PLAYGROUND_NOT_FOUND`，退出码 3
- 验证：test

### Requirement: `doctor` 诊断和导出诊断包
`runyard doctor` MUST 返回 `cli`（`version`、`kind`：`app` 或 `source`、`path`、`other`：另一种安装是否也在 `PATH` 上，没有则 `null`）、`supervisor`（运行时含 `running: true`、`version`、`protocol`、`build`、`startedBy`、`runs`）、`tools`（工具检测结果，每项含 `tool`、`status`，有则含 `path`、`version`）、`library`（`root`）、`system`（`os`、`version`、`arch`）。`--template <id>` MUST 只检测该模板需要的工具。`--bundle` MUST 导出一个 zip 并返回 `{ "bundle": "<绝对路径>", "files": [...] }`，zip 里 MUST 含 `doctor --json` 的结果、`supervisor.json`、`toolchain.json`、最近 3 次运行日志、`app.log`、`supervisor.log`、系统版本和芯片架构；打包前 MUST 去掉 `supervisor.json` 里的握手口令和设置里代理地址中的账号与密码，诊断包里 MUST NOT 再出现它们。
来源：PRD #prd-cli-commands；PRD #prd-cli-distribution；PRD #prd-settings-toolchain

#### Scenario: [CLI-COMMANDS-63] 基本诊断
- **WHEN** 执行 `runyard doctor --json`
- **THEN** 结果含 `cli`、`supervisor`、`tools`、`library`、`system` 五个键；`supervisor.running` 是 `true`
- 验证：test

#### Scenario: [CLI-COMMANDS-64] 只检测某个模板需要的工具
- 前提：本机没有 Go
- **WHEN** 执行 `runyard doctor --template react19 --json`
- **THEN** `tools` 里只有 `node` 和 `pnpm`（或 `npm`）相关项，没有 `go`
- 验证：test

#### Scenario: [CLI-COMMANDS-65] 诊断包里没有口令和账号密码
- 前提：`supervisor.json` 的握手口令是一串已知的随机字符，设置里的代理地址是 `http://user:secret@proxy.example:8080`
- **WHEN** 执行 `runyard doctor --bundle --json`
- **THEN** 返回的 zip 存在；解开后任何文件里都找不到那串口令、`user` 和 `secret` 作为账号密码的出现；代理的主机和端口可以保留
- 验证：test

#### Scenario: [CLI-COMMANDS-66] 诊断包的内容
- 前提：有 5 次运行日志
- **WHEN** 执行 `runyard doctor --bundle --json`
- **THEN** zip 含上面列出的各项，运行日志只有最近 3 次
- 验证：test

#### Scenario: [CLI-COMMANDS-67] 两种安装并存
- 前提：`PATH` 上既有随应用安装的 `runyard`，又有从源码运行的开发版，版本不同
- **WHEN** 执行 `runyard doctor --json`
- **THEN** `cli.other` 不是 `null`，写明另一种的 `kind`、`version`、`path`
- 验证：test

### Requirement: 模板命令
`runyard template list` MUST 返回 `{ "templates": [...] }`，每项含 `id`、`name`、`description`、`category`、`tags`、`source`（`builtin` 或 `user`）、`runner`、`kind`、`requires`、`valid`；`name`、`description` MUST 原样带着模板里的值（字符串或语言到文字的对象），MUST NOT 随命令行语言挑选。`template show <id>` MUST 返回 `{ "template": {...同上}, "path", "files": [...] }`，`files` 是模板里文件的相对路径，用 `/` 分隔。`template save`、`template lint`、`template test` 的行为分别见 templates/custom、templates/format；`lint` 与 `test` MUST 在命令行进程里直接运行，MUST NOT 经过管理进程。`lint` 与 `test` 的结果 MUST 是含 `ok` 的对象；失败时 MUST 仍输出该对象，退出码取失败原因对应的错误码的退出码。模板不存在 MUST 报 `TEMPLATE_NOT_FOUND`。
来源：PRD #prd-cli-commands；PRD #prd-template-lint-test；PRD #prd-custom-templates

#### Scenario: [CLI-COMMANDS-68] 列出模板
- **WHEN** 执行 `runyard template list --json`
- **THEN** 内置的九个模板都在，每项含上面列出的键，`source` 是 `"builtin"`
- 验证：test

#### Scenario: [CLI-COMMANDS-69] 名称不随语言变
- **WHEN** 分别用 `--lang en` 和 `--lang zh-CN` 执行 `template list --json`
- **THEN** 两次输出逐字相同；`name` 是模板里写的原样值
- 验证：test

#### Scenario: [CLI-COMMANDS-70] 查看一个模板
- **WHEN** 执行 `runyard template show react19 --json`
- **THEN** 结果含 `template`、绝对 `path` 和 `files`，`files` 里没有绝对路径，也没有反斜杠
- 验证：test

#### Scenario: [CLI-COMMANDS-71] 不存在的模板
- **WHEN** 执行 `runyard template show nope --json`
- **THEN** 错误码 `TEMPLATE_NOT_FOUND`，退出码 3
- 验证：test

#### Scenario: [CLI-COMMANDS-72] lint 与 test 不经管理进程
- 前提：管理进程启动被禁止
- **WHEN** 执行 `runyard template lint html --json`
- **THEN** 命令成功，没有尝试连接管理进程
- 验证：test

### Requirement: `skill install` 把给智能体的说明写到约定位置
`runyard skill install` MUST 按 `--target claude|agents|all` 把说明写到 `~/.claude/skills/runyard/SKILL.md` 和 `~/.agents/skills/runyard/SKILL.md`；不给 `--target` 时 MUST 是 `all`。已有同名文件时 MUST 用当前版本的内容覆盖；目录不存在时 MUST 创建。结果 MUST 是 `{ "installed": [ { "target", "path" } ] }`。说明的全文和其中的命令示例 MUST 是英文，MUST 包含这些要点：永远带 `--json`；用 `new … --run --note` 创建并启动；直接改 `path` 下的文件；用 `logs --since <游标>` 看结果；用完用 `stop`；验证性的项目带 `--clean-after 30d`，用户说留着就不带；出错时按 `error.hint` 做，不要盲目重试；不要自己另起开发服务器；不教智能体去设置语言。
来源：PRD #prd-cli-commands；PRD #prd-decision-table（第 10 项）；PRD #prd-cli-creator

#### Scenario: [CLI-COMMANDS-73] 写到两个位置
- 前提：一个空的主目录
- **WHEN** 执行 `runyard skill install --json`
- **THEN** 两个 `SKILL.md` 都存在，结果的 `installed` 有 `claude` 和 `agents` 两项，路径是绝对路径
- 验证：test

#### Scenario: [CLI-COMMANDS-74] 只写一个目标
- **WHEN** 执行 `runyard skill install --target claude --json`
- **THEN** 只有 `~/.claude/skills/runyard/SKILL.md` 被写入
- 验证：test

#### Scenario: [CLI-COMMANDS-75] 覆盖旧版本
- 前提：目标位置已有一份旧内容
- **WHEN** 再次执行 `skill install`
- **THEN** 文件内容是当前版本的说明
- 验证：test

#### Scenario: [CLI-COMMANDS-76] 说明的要点与语言
- **WHEN** 读取写出的 `SKILL.md`
- **THEN** 内容是英文，含 `--json`、`--note`、`--since`、`--clean-after 30d`、`error.hint` 这些要点，不含 `config set lang`
- 验证：test

#### Scenario: [CLI-COMMANDS-77] 目标值不对
- **WHEN** 执行 `runyard skill install --target other`
- **THEN** 报 `USAGE`，退出码 2，没有写任何文件
- 验证：test

### Requirement: 命令行随应用安装，并能接到 `PATH` 上
桌面应用的安装包 MUST 自带命令行，它的版本和构建标识 MUST 与应用相同，`runyard doctor` 的 `cli.kind` 是 `app`。“安装命令行工具”MUST 在用户自己的 bin 目录（`~/.local/bin`，不需要管理员权限）建一个名为 `runyard` 的链接，指向应用里的命令行启动脚本；目录不存在时 MUST 先建它。同一位置已有不是指向 Runyard 的文件或链接时 MUST 失败并写明，MUST NOT 覆盖它；已是指向 Runyard 的链接（包括旧位置的应用）时 MUST 改为指向当前应用。“移除”MUST 只删除指向 Runyard 的那个链接，MUST NOT 删其他东西。应用被移动位置后，经链接运行的命令行 MUST 仍能找到应用，找不到时 MUST 报错并提示重新安装命令行工具。
来源：PRD #prd-cli-distribution；PRD #prd-settings-items

#### Scenario: [CLI-COMMANDS-80] 版本与应用一致
- 前提：安装的是 0.2.0 版的应用
- **WHEN** 经链接执行 `runyard doctor --json`
- **THEN** `cli.version` 是 0.2.0，`cli.kind` 是 `app`，构建标识与应用的相同
- 验证：test

#### Scenario: [CLI-COMMANDS-81] 建立链接
- 前提：`~/.local/bin` 不存在
- **WHEN** 安装命令行工具
- **THEN** 建出 `~/.local/bin/runyard`，指向应用里的启动脚本；经它执行 `runyard new html demo --run` 成功
- 验证：test

#### Scenario: [CLI-COMMANDS-82] 不覆盖别人的文件
- 前提：`~/.local/bin/runyard` 是用户自己的一个脚本
- **WHEN** 安装命令行工具
- **THEN** 失败并写明那个位置已有别的文件；那个脚本原样保留
- 验证：test

#### Scenario: [CLI-COMMANDS-83] 移除只删自己的链接
- 前提：`~/.local/bin/runyard` 是指向 Runyard 的链接，同目录还有别的文件
- **WHEN** 移除命令行工具
- **THEN** 只有这个链接被删除，同目录的其他文件都在
- 验证：test

#### Scenario: [CLI-COMMANDS-84] 链接指向旧位置的应用
- 前提：链接指向 `/Volumes/Old/Runyard.app` 里的启动脚本，应用现在在 `/Applications`
- **WHEN** 在新位置的应用里安装命令行工具
- **THEN** 链接改为指向 `/Applications/Runyard.app` 里的启动脚本
- 验证：test
