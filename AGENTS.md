# Runyard

> 不要在本仓库或它的上级目录里建 `CLAUDE.md`、`CLAUDE.local.md`：有了它们，Claude Code 就不再读这份文件。
> 个人偏好放 `~/.claude/CLAUDE.md`，或把 Claude Code 的 Project instructions 设置改为 `claude-md-and-agents-md`。

Runyard 是一个桌面应用（Electron、TypeScript）加一个命令行，用本地模板新建、运行和管理小的代码示例（叫“项目”，代码里是 `playground`）。
所有运行由一个后台的管理进程（`supervisor`）统一照看，桌面应用和命令行都只是它的客户端。命令行只随桌面应用安装，第一版不发 npm。
现状：1.0 之前，仓库里只有工具链和文档，产品代码还没开始写。范围和里程碑见 PRD #prd-release-plan。

## 语言

- 给开发者和智能体看的一切都用中文：代码注释、提交信息、PR 描述、说明文件、手册、决策记录、检查脚本的报错。
- 标识符、文件名、包名、命令、命令行输出、`--json` 字段名用英文。
- 提交信息用 Conventional Commits 的结构，`type(scope)` 是英文，主题是中文，如 `feat(core): 增加运行状态机`。
- `README.md`（英文）和 `README.zh-CN.md`（中文）要同步：改一个，同一次改动里改另一个。
- 产品术语只用 `docs/glossary.md` 里的说法；代码里用它对应的唯一英文标识符，不自己造同义词。

## 目录地图

只列现在存在的东西。新的包建立时，在同一个 PR 里给这张表加一行，并写它自己的 `AGENTS.md`。

| 路径 | 是什么 |
| --- | --- |
| `docs/product/` | 中文产品文档：PRD 和技术设计。产品行为的唯一出处，先读 `docs/product/README.md` |
| `docs/design/` | 界面设计源文件、设计变量、最终图标。只读 |
| `docs/architecture/` | `overview.md`（一页架构总览）、`decisions/`（决策记录）、`evidence/`（技术验证记录的实测数据、伪代码和证据链接）、`dependencies.md`（每个依赖的版本和理由），以及 M1 头三个包和命令行的实现细节：`protocol.md`、`protocol-methods.md`、`storage.md`、`run-state-machine.md`、`runner-format.md`、`platform-interface.md`、`cli-contract.md` |
| `docs/guides/` | 操作手册和命令表。有手册的任务按手册做，不要临场发挥 |
| `docs/glossary.md` | 术语表：中文术语、唯一的英文标识符、禁用的同义词 |
| `packages/platform/` | 平台层：`Platform` 接口、`getPlatform()`、路径与名称校验、`darwin` 和薄 `linux` 实现、契约测试（目前只有接口、paths 和占位，各块实现随后续 issue 加入） |
| `packages/protocol/` | 所有跨进程约定（目前有错误码、提示码、枚举、`RunyardError` / `Notice` / `LogEntry` / `Owner`、分帧、`Frame`、握手消息、版本比对） |
| `packages/i18n/` | 文案、`createTranslator`、数字和时长格式、命令行语言解析（`resolveCliLocale`）、由中文文案生成的键和参数类型 |
| `packages/core/` | 工具检测、运行引擎、资源库等业务逻辑（目前只有日志的切行、解码和读取时清洗） |
| `packages/testing/` | 测试替身：假时钟、假平台（含假进程、假端口、内存文件系统、假工具链）、临时主目录；只在 `*.test.ts` 里导入（决策记录 0014） |
| `tooling/checks/` | 仓库检查脚本，`pnpm check` 的全部内容；`layers.json` 是包依赖规则的唯一出处 |
| `tooling/scripts/` | 脚本：`deps-lookup.ts`（查依赖版本和公告）、`generate.ts`（生成文档里的表） |
| `tooling/hooks/` | Claude Code 的钩子脚本，由 `.claude/settings.json` 调用 |
| `tooling/design-render/` | 把设计源文件渲染成图片的脚本（图片不进仓库） |
| `security/allowlist.toml` | 依赖安全允许清单，改之前先问 |
| `.claude/` | Claude Code 的设置、skills、子智能体 |

## 包依赖规则

“可以导入”之外的一律不行。这张表由 `pnpm generate` 从 `tooling/checks/layers.json` 生成，不要手改；要改规则，改 `layers.json` 并写决策记录（先问）。

<!-- generated:layers 开始（由 pnpm generate 生成，不要手改） -->
| 包 | 可以导入 | 现状 |
| --- | --- | --- |
| `@runyard/protocol` | 无 | 已有 |
| `@runyard/tokens` | 无 | 还没建 |
| `@runyard/i18n` | `@runyard/protocol` | 已有 |
| `@runyard/platform` | `@runyard/protocol` | 已有 |
| `@runyard/core` | `@runyard/protocol`、`@runyard/platform`、`@runyard/testing`（只在测试里） | 已有 |
| `@runyard/supervisor` | `@runyard/protocol`、`@runyard/platform`、`@runyard/core`、`@runyard/testing`（只在测试里） | 还没建 |
| `@runyard/client` | `@runyard/protocol`、`@runyard/platform`、`@runyard/testing`（只在测试里） | 还没建 |
| `runyard` | `@runyard/protocol`、`@runyard/platform`、`@runyard/client`、`@runyard/core`、`@runyard/i18n`、`@runyard/testing`（只在测试里） | 还没建 |
| `@runyard/testing` | `@runyard/protocol`、`@runyard/platform`、`@runyard/core`（只在测试里） | 已有 |
<!-- generated:layers 结束 -->

下面几条在对应的包建立时生效（现在多数包还没建，先知道；出处是技术设计 §3.2）：

- `electron` 只许出现在桌面应用里；界面进程（renderer）里不许用 Node 接口。
- `@runyard/protocol` 里不许用 Node、浏览器、Electron 的任何接口。
- 系统分支（读 `process.platform`、直接启动进程、手写路径分隔符）只许写在 `@runyard/platform` 和桌面应用主进程的 integration 目录里，其他地方调用平台接口。
- 第一版只发 macOS（决策记录 0013）：平台层只有 `darwin` 和薄的 `linux` 两份实现，不许新增只属于 Windows 的代码（`win32` 实现、辅助程序、安装器）；接口按以后好加 Windows 来写（不假设信号和进程组，进程身份是 pid 加启动时间）。依赖平台实现的测试只在 macOS 和 Ubuntu 跑，在 Windows 上只通过测试手册里那一个机制跳过，不在测试里写 `if (process.platform …)`。
- 包之间只从入口导入（如 `@runyard/core`），不伸进内部文件。
- 管理进程一侧的包（protocol、platform、core、supervisor、client）不产生给人看的句子，只发“代码加参数”。
- 界面分五层，只能从上往下导入，通用组件包不认识产品；给人看的文字一律走文案包。

## 命令

在仓库根目录运行，需要 Node 24（版本见 `.node-version`）。完整的表见 `docs/guides/commands.md`。

```sh
pnpm install                 # 安装依赖
pnpm verify                  # 交付前必跑：lint + typecheck + check + 受影响的包的测试
pnpm check                   # 全部仓库检查（依赖规则、文档、术语、PRD 锚点等）
pnpm lint                    # Biome：格式和代码规则，只检查不修改
pnpm format                  # Biome：按规则重排格式
pnpm typecheck               # tsc -b，全仓库类型检查
pnpm test                    # 全部包的单元测试
pnpm test --filter <包名>     # 只跑一个包的测试，如 pnpm test --filter @runyard/protocol
pnpm generate                # 重新生成文档里由脚本生成的部分
pnpm deps:lookup <包名>       # 查一个依赖的候选版本、发布日期和安全公告
```

Claude Code 的钩子：改完文件后对那一个文件跑 Biome；结束回复前跑 `tsc -b` 和 `pnpm check`，不通过就继续修，超过 90 秒放行并提示。钩子不代替 `pnpm verify`。

## 工作流程

1. 找到要改的行为在 PRD 里的位置，用锚点引用（写法 `PRD #prd-run-ownership`），不用章节号。技术设计还没有锚点，引用它时写章节号。
2. 在下面的对照表里找手册，有就逐步照做。读你要改的每个目录里的 `AGENTS.md`（如果有）。
3. 修缺陷先写一个能复现的失败测试。测试放在代码旁边：`allowlist.ts`、`allowlist.test.ts`。
4. 说“做完了”之前运行 `pnpm verify` 并贴出结果。没运行过的不要说通过。
5. 把任务交给任何子智能体时，交代里写明：先读根 `AGENTS.md` 和所改目录的 `AGENTS.md`。
6. 手册有错或缺步骤，在同一次改动里改掉。新增一类任务时，在同一个 PR 里写它的手册。
7. 长期有用的知识写进仓库（这份文件、手册、决策记录），不留在某台机器的智能体记忆里。

| 任务 | 读 |
| --- | --- |
| 加依赖、升级依赖 | `docs/guides/add-a-dependency.md` |
| 记录一个决定 | `docs/guides/write-an-adr.md` |
| 写测试，尤其是需要平台实现的测试 | `docs/guides/testing.md` |
| 加或改一条给人看的文字（命令行） | `docs/guides/add-ui-string.md` |
| 查某条命令跑什么 | `docs/guides/commands.md` |

完成标准（一个 PR 合并前）：引用了 PRD 锚点；新行为有测试；`pnpm verify` 通过并贴了结果；改了包结构、依赖规则、磁盘格式、构建发布做法的附了决策记录；动了依赖的按手册十步做完；文字都是中文，两个 README 同步；没有新增未说明的跳过。

## 约定

- 一个文件一个概念，文件名是主要导出的 kebab-case 名字。不建 `utils.ts`、`helpers.ts`、`common.ts`。
- 只用具名导出。不用 `enum`、`namespace`（源码要能在去掉类型后直接运行）。
- 源码文件不超过 400 行，函数不超过 80 行。超了就拆，不调上限。
- 注释写“为什么”，不写“做了什么”。不加许可证头。
- 检查脚本的报错是一句指令：哪里错、怎么改、看哪份文档。
- 本机地址一律写 `127.0.0.1`。运行器的命令是参数数组，不经过 shell；`stop` 不写信号名。

## 禁止事项

- 不要绕过检查：不放松规则、不加例外、不删测试、不跳过测试来让检查变绿。觉得检查错了，停下来问。
- 不要无说明地压掉报错（`biome-ignore`、`@ts-expect-error`、跳过测试）：旁边必须有带 issue 编号的注释。
- 不要手改 `package.json` 里的版本号，不要写 `^`、`~`、`latest`。加或升级依赖之前按手册查公告（OSV、GitHub 公告库、项目公告页三处）、查年龄（满 15 天）、记进 `docs/architecture/dependencies.md`。
- 不要设 `dangerouslyAllowAllBuilds`，不要不看脚本就批准依赖的安装脚本，不要用 `--force` 或 `--no-frozen-lockfile`。
- 不要为了让检查变绿而改 `security/allowlist.toml` 或 `minimumReleaseAgeExclude`，要改先问。
- 不要手改 `pnpm-lock.yaml` 和文档里两行 generated 标记之间的内容，它们是生成的。
- 不要把 `node-pty` 或任何原生模块加进 `packages/` 下的包。
- 不要用 `fs.rm` 一类的永久删除来删用户的项目，只用平台层的 `fs.trash`。端口探测不要绑定 `0.0.0.0`。
- 不要在测试或开发运行中读写用户真实的 `~/Runyard` 和 `~/.runyard`，用临时目录。
- 不要把过程产物（讨论、调研、评审、草稿）放进仓库；说明文件只引用仓库里存在的文件。
- 不要改 `docs/product/` 里的产品文档，除非任务明确要求（改之前要负责人同意）。
- 不要推送到 `main`，变更只经 PR 进入 `main`（六项必过检查通过后自动合并，决策记录 0012）；不要发版或发布到 npm，这些由负责人做。

## 拿不准的时候

- 产品行为：PRD 说了算。PRD 和代码不一致时，停下来报告，不要自己选一个。
- 架构：先看 `docs/architecture/overview.md`，再看决策记录，再看技术设计。
- 文档之间互相矛盾、被检查卡住又不知道怎么改、需要改规则才能继续：停下来，把情况和选项告诉负责人。
