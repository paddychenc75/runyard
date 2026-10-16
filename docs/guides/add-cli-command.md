# 加一条命令行命令

命令行的约定在 `docs/architecture/cli-contract.md`，行为在规格 `openspec/specs/cli/commands/`，包内的结构在 `packages/cli/AGENTS.md`。

## 何时用

- 要给 `runyard` 加一条命令或子命令，或给已有命令加选项
- 要让一条只有声明的命令（`new`、`run`、`doctor`、`template …`、`skill install`）有行为

## 步骤

1. **先看规格。** 命令的 `--json` 键、错误码、退出码在 `openspec/specs/cli/commands/spec.md` 里有没有批准的场景；没有就停下来，不要自己定行为。
2. **声明。** 在 `packages/cli/src/commands/declarations.ts` 找到这条命令（已有声明就用它）：`name`（子命令用空格连接，如 `config get`）、位置参数、选项（`type: "boolean" | "string"`，可重复的写 `multiple`，帮助里的值占位写 `valueName`）、`needsSupervisor`。新子命令的组要在 `groups` 里有一项。
3. **写文案。** 说明文字放 `cli` 组：`cli.command.<名>.title`、`cli.arg.<名>.hint`、`cli.option.<名>.hint`，运行时输出的句子用 `cli.<命令>.<元素>.body`。步骤同 `docs/guides/add-ui-string.md`（先中文、再英文、写备注、`pnpm i18n:build`）。声明里写成 `(t) => t("键")`，键必须是字面量。
4. **写实现。** `run: async (context) => { … }`，放在 `packages/cli/src/commands/<命令>.ts`（一个文件一条命令）。取参数用 `context.positionals`、`context.flag/value/values`；选项值的语义校验（数字、`k=v`）失败抛 `usageError`。要管理进程就 `const client = await context.client()`，再 `client.call(方法, 参数)`；`needsSupervisor: false` 的命令不许调它。
5. **输出。** 结果只经 `context.out.result(json, 文字行)`：`json` 是 `--json` 下的整个对象（键名按规格，路径绝对，地址用 `127.0.0.1`），文字行是 `t(...)` 得到的 `Localized`。进度用 `out.progress`，管理进程给的提示用 `out.notice`（`--json` 下自动进 `notices`），用户的数据（日志正文、名称）用 `out.data`。持续输出的 `logs --follow` 用 `out.stream`。
6. **报错。** 抛 `cliError(code, params)`（码和参数来自 `packages/protocol` 的登记表，退出码自动取登记表），用法问题抛 `usageError`。`ClientError`、`PlatformError` 不必捕获，会原样变成同样的输出。不要自己 `process.exit`，不要写 `process.stdout`。
7. **注册并更新帮助快照。** 换掉声明里的 `run` 后运行 `pnpm --filter runyard exec vitest run --project unit --update src/help`，读 `git diff` 确认两份快照（`help.en.txt`、`help.zh-CN.txt`）只多了预期的内容。
8. **写测试。** 单元测试用 `Harness`（`packages/cli/src/cli-harness.test.ts`）：`new Harness({ handlers, connect })`，`await h.run(["run", "demo", "--json"])` 得到 `{ code, stdout, stderr }`，`h.json(result)` 解析 `--json` 输出；管理进程用 `connect` 换成假的。每个 `验证：test` 场景的标题带编号。断言错误码和键，不断言显示出来的句子。

## 验证

- `pnpm test --filter runyard`，`pnpm check`（含 `ui-strings`、`i18n-*`）、`pnpm verify` 通过
- 在仓库里手动试，用临时目录：`node packages/cli/src/main.ts --root "$(mktemp -d)" <命令> --json`，文本模式和 `--json`、`--lang zh-CN` 各看一遍；结束后确认没有留下管理进程
- `--json` 在 `--lang en` 与 `--lang zh-CN` 下逐字相同

## 完成标准

- 声明、文案（两种语言）、实现、测试、两份帮助快照在同一个 PR 里
- `--json` 下标准输出恰好一个对象，错误是 `{"error":{code,message,hint,data}}`，退出码取自登记表
- 代码里没有写死的句子，没有 `process.stdout`、`process.exit`、`process.platform`
- 没有读写真实的 `~/Runyard` 和 `~/.runyard`
