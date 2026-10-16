# runyard（命令行）

## 用途

`runyard` 命令：参数解析、输出模块、`--json`、退出码映射、语言解析、`--help`（技术设计 §5.3、§6.8；`docs/architecture/cli-contract.md`；规格 `openspec/specs/cli/commands`）。命令行只随桌面应用安装，第一版不发 npm：包是 `private`，没有 `bin`、没有发布配置；M1 期间从仓库源码运行（`pnpm --filter runyard start -- <参数>` 或 `node packages/cli/src/main.ts <参数>`）。
现状：`config get|set lang`、`doctor`（含 `--template`、`--bundle`）、`skill install`、`template list|show|save|lint` 有行为；`new run stop status logs rm` 和 `template test` 只有声明（帮助里看得到，运行得到 `NOT_SUPPORTED`，退出码 10），前者由 #46、#47 补，`template test` 的冒烟测试在 #54。

## 对外暴露什么

不是库，没有给别的包用的导出。给后续命令用的是内部约定：
- 入口 `runCli(io, deps): Promise<number>`（`src/run-cli.ts`）：参数、环境变量、标准输出、标准错误、依赖都从参数进，返回退出码，不碰 `process`。`src/main.ts` 只做接线。
- 声明一条命令：`defineCommand({ name, title, positionals, options, needsSupervisor, run })`，加进 `src/commands/declarations.ts`；步骤见 `docs/guides/add-cli-command.md`。`run(context)` 拿到 `CommandContext`（`src/commands/command-context.ts`）：`positionals`、`flag/value/values`、`t`、`format`、`out`、`platform`、`env`、`settings`、`client()`。
- 输出只经 `context.out`（`src/output/output.ts`）：`result(json, 文字行)`、`line`、`data`、`progress`、`notice`、`stream`；失败直接抛 `cliError(code, params)` 或 `usageError(...)`，或让 `ClientError` / `PlatformError` 原样冒出来。
- `CommandContext.host`（`CliHost`，`src/cli-deps.ts`）：这一份命令行是什么（`install`：app 或 source、版本、位置）、模板数据目录（内置模板、运行器、工具定义）、临时目录、时钟、`probeInstall`（看一眼 PATH 上另一份 runyard 是哪种安装）。组合根给真的，`Harness` 给假的。
- 组合根 `src/composition-root.ts` 的 `CliConfig` 是管理进程入口位置的唯一配置值（开发时是 `packages/supervisor/src/main.ts`）；打包后的位置没定。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`platform`、`client`、`i18n`、`core`（`ToolchainService`、模板的读取和 lint）；测试里可以导入 `testing`。不许导入 `supervisor`。依赖规则的唯一出处是 `tooling/checks/layers.json`。
- 所有给人看的文字都来自 `packages/i18n`（`cli` 组和 `errors.*`、`notice.*`）；代码里不写句子，命令说明写成 `(t) => t("键")`。命令名、选项名、占位符（`<pg>`）不翻译。只有 `src/output/` 可以写标准输出和标准错误（`ui-strings` 检查）。
- `--json`：标准输出恰好一个对象（`result` 或 `{"error":…}`），只有 `logs --follow` 用 `stream()` 每行一个对象。`message` 与 `hint` 永远是英文（取英文文案的 `title`、`hintCli`；用法错误的 `message` 是更具体的英文说明）；`data` 是错误码登记的参数。输出不随语言变，不含堆栈和 `debug`。
- 退出码只取 `errorRegistry[code].exit`，本包没有第二张表。管理进程返回了登记表里没有的错误码时按 `INTERNAL`（1）。成功但 `--json` 下没写任何结果也按 `INTERNAL`。
- 语言：`--lang`，`RUNYARD_LANG`，`~/.runyard/cli.json` 的 `lang`，英文；用 `resolveCliLocale`，不看系统语言；不认识的值在标准错误一行英文提示。`--lang` 和环境变量从不写文件，只有 `config set lang` 写。
- 参数解析用 Node 自带的 `util.parseArgs` 分词，校验自己做（未知选项、缺值、布尔带值、缺参数、多参数都是 `USAGE`）。不加解析库。
- `--quiet` 只压进度和提示（`progress`、`notice`），不压结果和错误，不改 `--json`。`--root <dir>` 暂时代替主目录（状态目录 `<dir>/.runyard`）；两条都是 cli-contract“未定”项的暂定做法，等负责人确认。
- `needsSupervisor: false` 的命令不许调 `context.client()`；`client()` 第一次调用才连，一次命令只连一次，结束时关闭。
- 测试不读写 `~/Runyard`、`~/.runyard`：单元测试用假平台，进程测试用 `--root` 指向 `mktemp` 目录。

## 本包里已有行为的命令

- `doctor`（`src/commands/doctor.ts`、`src/doctor/`）：`cli`、`supervisor`、`tools`、`library`、`system` 五项。`tools` 在本进程里用 `ToolchainService` 直接检测（不写缓存），所以管理进程连不上时也有；连不上时 `supervisor` 是 `{ running: false, reason: <错误码> }`，退出码 0。缺失或过低的工具带 `install` 提示（`src/doctor/install-hints.ts` 的 `installHints`：在用版本管理工具给它的命令，否则有 Homebrew 给 Homebrew 的，官网链接始终在，模板自己写的 `install` 标 `via: "template"`），**只展示，从不执行**；选哪条的核心规则（TEMPLATES-FORMAT-35）归 core 的安装模块（#36），合并后换掉这个函数体。`--bundle`：只收规格列的各项（`doctor.json`、去掉 `token` 的 `supervisor.json`、`toolchain.json`、`runs/` 下最近三个运行日志、`app.log`、`supervisor.log`、`system.json`），所有文本再抹掉口令和网址里的账号密码（`scrub-secrets.ts`，不依赖设置里代理字段的名字）；zip 自己写（`zip-writer.ts`，不加依赖）；写到 `host.tempDir/runyard-doctor-<时间>.zip`，没有 `--out`（规格没有）。运行日志文件的命名由 #43 定，现在假定“logs/ 下不是 `app.log`、`supervisor.log`（含轮转）的文件”，名字最大的三个。
- `skill install`（`src/commands/skill-install.ts`、`src/skill/skill-text.ts`）：只写 `<主目录>/.claude/skills/runyard/SKILL.md` 和 `<主目录>/.agents/skills/runyard/SKILL.md`；全文是英文数据，不走文案包，有快照测试。
- `template list|show|save` 经管理进程（`template.list|get|save`）；`save` 在发请求前先校验 `--as`（`NAME_INVALID`）和 `--include|--exclude`（`USAGE`）。`template lint` 在本进程直接调 core 的 `lintTemplateRef`；有错误时先输出结果对象，再以 `TEMPLATE_INVALID`（2）结束。管理进程一侧的 `template.*` 处理不在本包。

## 子目录地图

- `src/run-cli.ts`（解析、建输出和翻译、统一的错误出口）、`execute-command.ts`（分派帮助和命令）、`parse-command-line.ts`、`cli-error.ts`、`cli-deps.ts`、`composition-root.ts`、`main.ts`
- `src/commands/`：声明（`declarations.ts`）、`command-spec.ts`、`command-context.ts`、`global-options.ts`、`config-commands.ts`、`doctor.ts`、`skill-install.ts`、`template-commands.ts`；`src/doctor/`：诊断的各部分；`src/skill/`：SKILL.md 全文；`src/templates/`：模板目录位置；`src/real-clock.ts`
- `src/output/`：唯一的输出口；`src/help/`：`--help` 正文；`src/settings/`：`cli.json`；`src/language/`：语言解析
- `src/help/__snapshots__/help.en.txt`、`help.zh-CN.txt`：`--help` 快照

## 测试

```sh
pnpm test --filter runyard
pnpm --filter runyard exec vitest run --project unit --update src/help   # 改了命令、选项或帮助文案之后更新快照，再读 git diff
```

单元测试在进程内调 `runCli`（`cli-harness.test.ts` 给假平台和可替换的命令实现）。`main.platform-dependent.test.ts` 起真正的入口和真正的管理进程，临时目录，不碰真实目录。
