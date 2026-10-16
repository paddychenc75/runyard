# runyard（命令行）

## 用途

`runyard` 命令：参数解析、输出模块、`--json`、退出码映射、语言解析、`--help`（技术设计 §5.3、§6.8；`docs/architecture/cli-contract.md`；规格 `openspec/specs/cli/commands`）。命令行只随桌面应用安装，第一版不发 npm：包是 `private`，没有 `bin`、没有发布配置；M1 期间从仓库源码运行（`pnpm --filter runyard start -- <参数>` 或 `node packages/cli/src/main.ts <参数>`）。
现状：骨架完成。只有 `config get|set lang` 有行为；`new run stop status logs rm doctor template skill` 只有声明（帮助里看得到，运行得到 `NOT_SUPPORTED`，退出码 10），行为由 #46 到 #49 补。

## 对外暴露什么

不是库，没有给别的包用的导出。给后续命令用的是内部约定：
- 入口 `runCli(io, deps): Promise<number>`（`src/run-cli.ts`）：参数、环境变量、标准输出、标准错误、依赖都从参数进，返回退出码，不碰 `process`。`src/main.ts` 只做接线。
- 声明一条命令：`defineCommand({ name, title, positionals, options, needsSupervisor, run })`，加进 `src/commands/declarations.ts`；步骤见 `docs/guides/add-cli-command.md`。`run(context)` 拿到 `CommandContext`（`src/commands/command-context.ts`）：`positionals`、`flag/value/values`、`t`、`format`、`out`、`platform`、`env`、`settings`、`client()`。
- 输出只经 `context.out`（`src/output/output.ts`）：`result(json, 文字行)`、`line`、`data`、`progress`、`notice`、`stream`；失败直接抛 `cliError(code, params)` 或 `usageError(...)`，或让 `ClientError` / `PlatformError` 原样冒出来。
- 组合根 `src/composition-root.ts` 的 `CliConfig` 是管理进程入口位置的唯一配置值（开发时是 `packages/supervisor/src/main.ts`）；打包后的位置没定。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`platform`、`client`、`i18n`、（`core`，现在没用到）；测试里可以导入 `testing`。不许导入 `supervisor`。依赖规则的唯一出处是 `tooling/checks/layers.json`。
- 所有给人看的文字都来自 `packages/i18n`（`cli` 组和 `errors.*`、`notice.*`）；代码里不写句子，命令说明写成 `(t) => t("键")`。命令名、选项名、占位符（`<pg>`）不翻译。只有 `src/output/` 可以写标准输出和标准错误（`ui-strings` 检查）。
- `--json`：标准输出恰好一个对象（`result` 或 `{"error":…}`），只有 `logs --follow` 用 `stream()` 每行一个对象。`message` 与 `hint` 永远是英文（取英文文案的 `title`、`hintCli`；用法错误的 `message` 是更具体的英文说明）；`data` 是错误码登记的参数。输出不随语言变，不含堆栈和 `debug`。
- 退出码只取 `errorRegistry[code].exit`，本包没有第二张表。管理进程返回了登记表里没有的错误码时按 `INTERNAL`（1）。成功但 `--json` 下没写任何结果也按 `INTERNAL`。
- 语言：`--lang`，`RUNYARD_LANG`，`~/.runyard/cli.json` 的 `lang`，英文；用 `resolveCliLocale`，不看系统语言；不认识的值在标准错误一行英文提示。`--lang` 和环境变量从不写文件，只有 `config set lang` 写。
- 参数解析用 Node 自带的 `util.parseArgs` 分词，校验自己做（未知选项、缺值、布尔带值、缺参数、多参数都是 `USAGE`）。不加解析库。
- `--quiet` 只压进度和提示（`progress`、`notice`），不压结果和错误，不改 `--json`。`--root <dir>` 暂时代替主目录（状态目录 `<dir>/.runyard`）；两条都是 cli-contract“未定”项的暂定做法，等负责人确认。
- `needsSupervisor: false` 的命令不许调 `context.client()`；`client()` 第一次调用才连，一次命令只连一次，结束时关闭。
- 测试不读写 `~/Runyard`、`~/.runyard`：单元测试用假平台，进程测试用 `--root` 指向 `mktemp` 目录。

## 子目录地图

- `src/run-cli.ts`（解析、建输出和翻译、统一的错误出口）、`execute-command.ts`（分派帮助和命令）、`parse-command-line.ts`、`cli-error.ts`、`cli-deps.ts`、`composition-root.ts`、`main.ts`
- `src/commands/`：声明（`declarations.ts`）、`command-spec.ts`、`command-context.ts`、`global-options.ts`、`config-commands.ts`
- `src/output/`：唯一的输出口；`src/help/`：`--help` 正文；`src/settings/`：`cli.json`；`src/language/`：语言解析
- `src/help/__snapshots__/help.en.txt`、`help.zh-CN.txt`：`--help` 快照

## 测试

```sh
pnpm test --filter runyard
pnpm --filter runyard exec vitest run --project unit --update src/help   # 改了命令、选项或帮助文案之后更新快照，再读 git diff
```

单元测试在进程内调 `runCli`（`cli-harness.test.ts` 给假平台和可替换的命令实现）。`main.platform-dependent.test.ts` 起真正的入口和真正的管理进程，临时目录，不碰真实目录。
