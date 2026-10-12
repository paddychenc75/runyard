# 命令行：命令、参数、`--json` 输出、退出码、语言

`runyard` 命令的对外约定。智能体读 `--json`，人读默认输出。命令行只随桌面应用安装，第一版不发 npm；M1 期间从仓库源码运行（技术设计 §5.4）。本篇是写前说明，行为的细节随 `cli/commands` 能力规格补充。

出处：技术设计 §5.3、§5.4、§5.5、§6.8；PRD #prd-cli、#prd-cli-commands、#prd-cli-json、#prd-cli-language、#prd-cli-clean-after、#prd-cli-creator。错误码登记见 [protocol.md](protocol.md)。字段级示例另参考了技术设计形成过程中的专家方案，已按设计修订。

## 1. 全局规则

- 始终非交互：不提问、不等待输入。`<pg>` 是项目名称或路径。
- 全局参数：`--json`、`--quiet`、`--root <dir>`、`--lang <locale>`（只对这一条命令生效）。
- 带 `--json` 时标准输出上恰好一个对象：结果，或 `{"error": {...}}`；路径都是绝对路径。唯一例外是 `logs --follow --json`：每行一个对象（NDJSON），最后一行是 `{ "end": true, "cursor": … }`。
- `--json` 的输出不随语言变：字段名稳定、`code` 稳定；`error.message` 和 `error.hint` **永远是英文**，由命令行按错误码从英文文案生成（协议里已经没有这两个字段）。智能体看 `code`，不要解析 `message`。
- 本机地址一律字面量 `127.0.0.1`，不写 `localhost`。
- 智能体名称：环境变量 `RUNYARD_AGENT` 优先，其次已知智能体自己的环境变量（Claude Code 是 `CLAUDECODE`，值为 1；`AI_AGENT` 是跨工具的约定名）；都没有则创建者种类为 `cli`。创建命令原样记入。

## 2. 命令

| 命令 | 参数 | 对应 PRD |
| --- | --- | --- |
| `new <template> [name]` | `--run`、`--note <text>`、`--clean-after 30d`、`--var k=v`、`--if-exists reuse\|fail`、`--timeout <s>`、`--no-wait` | #prd-cli、#prd-naming |
| `run <pg>` | `--timeout <s>`（默认 60）、`--no-wait`、`--restart`、`--port <n>`（只用于这一次） | #prd-cli-json |
| `stop <pg>` / `stop --all` | `--mine`（只停命令行持有的） | #prd-stop |
| `status [pg]` | `--running` | #prd-run-view |
| `logs <pg>` | `--since <游标>`、`--tail <n>`（默认 200）、`--follow`、`--raw`（保留颜色码等控制序列；默认是清洗后的纯文本） | #prd-cli-json |
| `rm <pg>` | 先停止，再移到废纸篓；任何情形不永久删除 | #prd-retention |
| `doctor` | `--template <id>`、`--bundle`（导出诊断包 zip，打印路径；去掉口令和代理账号密码） | #prd-cli-commands |
| `template list \| show \| save \| lint \| test` | `test` 另有 `--keep-dir`、`--tool-version`；`lint`、`test` 在命令行进程里直接跑，不经管理进程 | #prd-template-lint-test |
| `skill install` | `--target claude\|agents\|all`；写 `~/.claude/skills/runyard/SKILL.md` 和 `~/.agents/skills/runyard/SKILL.md` | #prd-cli-commands |
| `config get lang \| set lang <locale>` | 唯一设置项 `lang`（`en` 或 `zh-CN`），存 `~/.runyard/cli.json`；`get` 显示生效的语言和来源（`--lang`、环境变量、设置、默认） | #prd-cli-language |

`new` 不给名称时按“模板标识加序号”自动命名，序号取现有最大序号加一，不回头补空缺（PRD #prd-naming）。创建时默认已保留，带 `--clean-after 30d` 才开启自动清理。`open`、`screenshot` 属于 P1，需要桌面应用，M1 不做。

## 3. `--json` 输出形状

```jsonc
// runyard new react19 pricing-table --run --note "pricing table layout test" --json
{ "id": "01JABCDEF…", "name": "pricing-table", "path": "/Users/me/Runyard/pricing-table",
  "template": "react19", "created": true, "entry": "src/App.tsx", "retention": "kept",
  "run": { "runId": "r_8f3a", "state": "ready", "kind": "server",
           "url": "http://127.0.0.1:7104/", "port": 7104, "readyMs": 1180,
           "alreadyRunning": false, "owner": "cli", "idleStopMinutes": 30,
           "logTail": "…", "cursor": "r_8f3a:12" } }

// runyard run hello-py --json   （脚本：等到退出才返回）
{ "runId": "r_91c2", "name": "hello-py", "state": "finished", "kind": "oneshot",
  "exitCode": 0, "durationMs": 41, "stale": false, "alreadyRunning": false,
  "output": "Hello\n", "truncated": false, "cursor": "r_91c2:3" }

// runyard status --json
{ "running": 2,
  "playgrounds": [
    { "id": "01JABCDEF…", "name": "pricing-table", "path": "/Users/me/Runyard/pricing-table",
      "template": "react19", "kind": "server", "state": "ready",
      "url": "http://127.0.0.1:7104/", "port": 7104,
      "owner": "cli", "agent": "Claude Code", "idleStopAt": "2026-10-11T13:40:00Z",
      "retention": "kept", "cleanInDays": null, "note": "pricing table layout test",
      "createdBy": { "kind": "agent", "agent": "Claude Code" },
      "lastUsedAt": "2026-10-11T13:10:00Z", "missing": false } ] }

// runyard logs pricing-table --since r_8f3a:12 --json
{ "text": "[vite] hmr update /src/App.tsx\n", "lines": 1, "cursor": "r_8f3a:13",
  "state": "ready", "truncated": false }

// 出错（message 与 hint 永远是英文，由命令行从错误码生成）
{ "error": { "code": "TOOL_MISSING", "message": "…", "hint": "Run: … then: runyard run demo",
             "data": { "tool": "go", "required": ">=1.26", "found": null } } }
```

端口被占用或被系统保留不是错误：结果里带 `portFallback`（原因可为 `PORT_RESERVED`）。示例里的版本号和命令是示意；`error.data` 即协议错误的 `params`。

## 4. 退出码

| 退出码 | 含义 | 错误码 |
| --- | --- | --- |
| 0 | 成功 | |
| 1 | 意外失败 | `INTERNAL` |
| 2 | 用法错误 | `USAGE` `NAME_INVALID` `NAME_RESERVED` `VAR_INVALID` |
| 3 | 未找到 | `PLAYGROUND_NOT_FOUND` `TEMPLATE_NOT_FOUND` `FOLDER_MISSING` |
| 4 | 缺少运行环境 | `TOOL_MISSING` `TOOL_TOO_OLD` `RUNTIME_MISSING` |
| 5 | 安装依赖失败 | `SETUP_FAILED` `DEPS_OFFLINE` |
| 6 | 就绪前退出，或脚本退出码非 0 | `RUN_FAILED` `SCRIPT_ERRORED` |
| 7 | 超时（进程仍在） | `READY_TIMEOUT` |
| 8 | 留给以后的“需要信任” | 无 |
| 9 | 冲突 | `NAME_EXISTS` `BUSY` `PATH_LOCKED` `PATH_TOO_LONG` `TRASH_UNAVAILABLE` |
| 10 | 环境问题 | `APP_REQUIRED` `SUPERVISOR_UNAVAILABLE` `SUPERVISOR_OUTDATED` `CLIENT_OUTDATED` `NOT_SUPPORTED` |

完整登记表在 `protocol` 的错误码登记里，退出码列由它生成（计划）；本表与它不一致时以登记表为准。

## 5. 语言切换规则（负责人 2026-10-12 决定，PRD #prd-cli-language）

1. 给人看的输出和 `--help` 有 `en`、`zh-CN` 两份；**默认英文，在任何系统上都是**，不读 `LANG`，中文系统上也默认英文。
2. 优先级从高到低：`--lang <locale>`；环境变量 `RUNYARD_LANG`；`~/.runyard/cli.json` 里的 `lang`（由 `runyard config set lang` 写）；英文。
3. 第一版支持的值只有 `en` 和 `zh-CN`；不认识的值退回英文，并在**标准错误**上输出一行英文提示，不污染 `--json` 的标准输出。
4. 读环境变量和文件由 `cli` 包做，再把三个值交给 `i18n` 的纯函数 `resolveCliLocale({ flag, env, saved })`。
5. 桌面应用和命令行各自配置语言，互不影响。
6. 测试断言错误码和文案键，不断言显示出来的文字；每种语言一份 `--help` 快照；一条测试证明同一命令在两种语言下的 `--json` 输出逐字相同。

## 6. 与桌面应用、管理进程的关系

命令行连接管理进程，连不上才启动它（`client` 包负责：发现、启动、握手、版本比对，见 protocol.md）。没有桌面应用时 P0 命令全部可用；命令行不拉起应用。命令行持有的运行在应用里可见，应用退出后继续由管理进程照看，空闲 30 分钟（可改）后自动停止。

## 未定

1. `stop`、`rm`、`doctor`、`template list|show|save`、`config get`、`skill install` 的 `--json` 输出形状，设计和 PRD 只给了上面五个示例；随 `cli/commands` 规格定。
2. `logs --follow --json` 每行对象的字段（只规定了结束行）。
3. 进度行输出到哪里（标准输出还是标准错误）、`--quiet` 到底压掉什么。
4. `new` 的 `--timeout` 默认值（`run` 是 60 秒，设计没有单列 `new` 的）。
5. `--root <dir>` 覆盖的是资源库根目录还是 `~/.runyard`。
6. 命令行读不到管理进程且无法启动时的重试次数与等待时间（0005 只给了“重试连接直到超时”）。
