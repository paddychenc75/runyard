<!-- 生成文件：由 pnpm generate 从 packages/protocol 的 zod 定义生成，不要手改。 -->
<!-- 要改内容，改 packages/protocol 里的定义，再运行 pnpm generate。 -->

# 登记表：错误码、退出码、提示码、枚举

代码一旦发布不改名、不复用，只许新增（见 [protocol.md](../architecture/protocol.md) 第 4 节）。参数只放可序列化的简单值，没有句子；给人看的文字在文案包里。

## 错误码

| 退出码 | 错误码 | 参数 |
| --- | --- | --- |
| 1 | `INTERNAL` | 无 |
| 2 | `USAGE` | 无 |
| 2 | `NAME_INVALID` | `{ name: string }` |
| 2 | `NAME_RESERVED` | `{ name: string }` |
| 2 | `VAR_INVALID` | `{ key: string }` |
| 3 | `PLAYGROUND_NOT_FOUND` | `{ name: string }` |
| 3 | `TEMPLATE_NOT_FOUND` | `{ template: string }` |
| 3 | `FOLDER_MISSING` | `{ name: string }` |
| 3 | `RUN_NOT_FOUND` | `{ runId: string }` |
| 4 | `TOOL_MISSING` | `{ tool: string; required: string }` |
| 4 | `TOOL_TOO_OLD` | `{ tool: string; required: string; found: string }` |
| 4 | `RUNTIME_MISSING` | `{ tool: string }` |
| 5 | `SETUP_FAILED` | `{ name: string }` |
| 5 | `DEPS_OFFLINE` | `{ name: string }` |
| 6 | `RUN_FAILED` | `{ name: string }` |
| 6 | `SCRIPT_ERRORED` | `{ name: string }` |
| 7 | `READY_TIMEOUT` | `{ name: string; seconds: number }` |
| 9 | `NAME_EXISTS` | `{ name: string }` |
| 9 | `BUSY` | `{ name: string }` |
| 9 | `PATH_LOCKED` | `{ name: string }` |
| 9 | `PATH_TOO_LONG` | `{ name: string }` |
| 9 | `TRASH_UNAVAILABLE` | `{ name: string }` |
| 10 | `APP_REQUIRED` | 无 |
| 10 | `SUPERVISOR_UNAVAILABLE` | 无 |
| 10 | `SUPERVISOR_OUTDATED` | `{ runs: integer }` |
| 10 | `CLIENT_OUTDATED` | 无 |
| 10 | `NOT_SUPPORTED` | 无 |
| 10 | `DATA_FROM_NEWER_VERSION` | `{ file: 'playground.json' \| 'library.json' \| 'settings.json' \| 'cli.json'; found: integer; supported: integer }` |

## 退出码

| 退出码 | 错误码 |
| --- | --- |
| 1 | `INTERNAL` |
| 2 | `USAGE`、`NAME_INVALID`、`NAME_RESERVED`、`VAR_INVALID` |
| 3 | `PLAYGROUND_NOT_FOUND`、`TEMPLATE_NOT_FOUND`、`FOLDER_MISSING`、`RUN_NOT_FOUND` |
| 4 | `TOOL_MISSING`、`TOOL_TOO_OLD`、`RUNTIME_MISSING` |
| 5 | `SETUP_FAILED`、`DEPS_OFFLINE` |
| 6 | `RUN_FAILED`、`SCRIPT_ERRORED` |
| 7 | `READY_TIMEOUT` |
| 9 | `NAME_EXISTS`、`BUSY`、`PATH_LOCKED`、`PATH_TOO_LONG`、`TRASH_UNAVAILABLE` |
| 10 | `APP_REQUIRED`、`SUPERVISOR_UNAVAILABLE`、`SUPERVISOR_OUTDATED`、`CLIENT_OUTDATED`、`NOT_SUPPORTED`、`DATA_FROM_NEWER_VERSION` |

## 提示码

| 提示码 | 参数 |
| --- | --- |
| `RELOADING` | 无 |
| `STOPPED_BY_USER` | 无 |
| `PROCESS_EXITED` | `{ exitCode?: integer; signal?: string }` |
| `DEPS_FROM_CACHE` | 无 |
| `PORT_FALLBACK` | `{ wanted: integer; actual: integer; reason: 'PORT_OCCUPIED' \| 'PORT_RESERVED' }` |
| `ENV_UNRESOLVED` | `{ reason: 'timeout' \| 'failed' }` |
| `ENV_DEGRADED` | 无 |
| `IDLE_STOPPED` | `{ minutes: integer }` |
| `PACKAGE_MANAGER_FALLBACK` | `{ wanted: string; used: string }` |
| `PATH_NEAR_LIMIT` | `{ length: integer; limit: integer }` |
| `PORT_NOT_RELEASED` | `{ port: integer; waitedMs: integer; limitMs: integer }` |
| `TOOL_VERSION_UNTESTED` | `{ tool: string; found: string; required: string }` |

## 枚举

| 常量 | 取值 |
| --- | --- |
| `runStates` | `checking`、`installing`、`starting`、`ready`、`reloading`、`running`、`stopping`、`stopped`、`finished`、`errored`、`crashed`、`failed` |
| `envSources` | `login-shell`、`login-shell-degraded`、`path-only`、`fallback` |
| `failureReasons` | `TOOL_MISSING`、`TOOL_TOO_OLD`、`SETUP_FAILED`、`DEPS_OFFLINE`、`RUN_FAILED`、`RUNTIME_MISSING` |
| `portFallbackReasons` | `PORT_OCCUPIED`、`PORT_RESERVED` |
| `runKinds` | `server`、`static`、`oneshot` |
| `toolStatuses` | `found`、`missing`、`too-old`、`unknown` |
| `createdByKinds` | `user`、`agent`、`cli` |
| `packageManagers` | `pnpm`、`npm` |
| `waitModes` | `none`、`ready`、`exit` |
| `shutdownReasons` | `upgrade`、`install`、`user` |
| `dataFileKinds` | `playground.json`、`library.json`、`settings.json`、`cli.json` |
| `eventTopics` | `playground`、`run`、`toolchain`、`settings` |
