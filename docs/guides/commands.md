# 命令表

在仓库根目录运行。需要 Node 24（版本见 `.node-version`）和 pnpm（版本见根 `package.json` 的 `packageManager`）。命令的唯一出处是根 `package.json` 的 `scripts`；这张表只解释每条跑什么，`docs-commands` 检查保证两边一致。

## 验证改动

| 命令 | 跑什么 | 什么时候用 |
| --- | --- | --- |
| `pnpm verify` | 依次：`pnpm lint`、`pnpm typecheck`、`pnpm check`、受影响的包的测试（先单元阶段、再进程阶段；用 turbo 对比 `main` 分支算出受影响的包） | 说“做完了”之前必跑。目标：本地 2 分钟内 |
| `pnpm test --filter <包名>` | 只跑一个包的测试（两个阶段），如 `pnpm test --filter @runyard/protocol` | 改某个包的过程中 |
| `pnpm test` | 全部包的测试：先单元阶段（各包并行），通过后再进程阶段（带 `.platform-dependent.test.ts` 后缀的测试，一次一个包） | 改了共用的东西，或想确认全部通过 |
| `pnpm test:unit` | 只跑单元阶段；可加 `--filter <包名>` | 没碰起进程的代码时，求快 |
| `pnpm test:process` | 只跑进程阶段；可加 `--filter <包名>` | 改了平台层、起进程的代码，或复现进程测试的问题 |
| 结束回复时的钩子 | 只跑 `tsc -b` 和 `pnpm check`，不跑测试。不通过就让智能体继续修；超过 90 秒放行并提示 | 自动运行（Claude Code），脚本是 `tooling/hooks/on-stop.ts` |

“受影响的包”只按包目录里的文件算，看不到包外的 `templates/`。读模板数据的包（现在是 `@runyard/core`、`@runyard/supervisor`、`runyard`）靠两处保证不漏：它们的 `packages/<包>/turbo.json` 把 `templates/**` 列为测试任务的输入（模板变了缓存就失效，不会拿旧结果放行）；`tooling/scripts/run-tests.ts` 在 `--affected` 且对比 `main` 发现 `templates/` 有改动时，另跑这些包（清单在 `tooling/scripts/template-readers.ts`，新增读 `templates/` 的包必须登记，测试会核对）。CI 跑全部包的测试，所以 CI 与本地结果一致。

`pnpm verify` 不含两个测试阶段以外的慢测试；两个阶段的划分和进程阶段的时间预算见 `docs/guides/testing.md`；模板冒烟测试和端到端测试随对应的包加入时，在这里各加一行。

## 单项

| 命令 | 跑什么 |
| --- | --- |
| `pnpm lint` | Biome 检查格式和代码规则，只检查不修改 |
| `pnpm format` | Biome 按规则重排格式（会改文件） |
| `pnpm typecheck` | `tsc -b`，按 project references 检查全仓库的类型 |
| `pnpm check` | 全部仓库检查，脚本在 `tooling/checks/`，清单见 `tooling/checks/run.ts`。每条报错都写明哪里错、怎么改 |
| `pnpm generate` | 重新生成由脚本生成的内容（根 `AGENTS.md` 里的包依赖表，`docs/reference/` 里的协议参考和文案对照表 `strings.md`，`packages/i18n/generated/messages.d.ts`）。改了 `tooling/checks/layers.json`、新建了包，改了 `packages/protocol` 里的方法、事件、错误码，或改了 `packages/i18n/locales/` 里的文案之后运行 |
| `pnpm i18n:build` | 只从 `packages/i18n/locales/zh-CN/*.json` 生成 `packages/i18n/generated/messages.d.ts`（文案的键和参数类型）；`pnpm generate` 也会生成它，另外还生成文案对照表。改了中文文案之后运行其一 |
| `pnpm template:lint` | 检查 `templates/` 里的工具定义、运行器和全部内置模板（每个模板一行 JSON 结果；有问题时退出码 2）。模板和运行器的写法见 `docs/guides/add-template.md`、`docs/guides/add-runner.md` |
| `pnpm template:smoke <模板标识> [--node <node 路径>] [--pm pnpm\|npm]`（别名 `pnpm test:template <模板标识>`） | 内置模板的冒烟（静态页面模板 `html` 走自带的页面服务，脚本类模板走真实的 node、python3、go，都不联网）。服务类模板：复制到系统临时目录，按运行器真的安装依赖、类型检查、（Vite 类）构建、启动、等 HTTP 响应、核对监听地址只有 127.0.0.1、改源文件（框架热更新的看进程不重启；`watch` 为 `restart` 的服务停了再起，端口不变、内容更新）、停止并确认端口释放、没有带运行标记的进程残留（2 秒内）。**需要网络**，不在 `pnpm test` 和 `pnpm verify` 里；声明范围的下限和上限版本各跑一次，见 `docs/guides/add-template.md`；CI 的接入见下面的“模板 CI”一节 |
| `pnpm deps:lookup <包名>` | 列出一个依赖最近 10 个稳定版本、发布日期、距今天数，并查 OSV 和 GitHub 公告库。用法见 `docs/guides/add-a-dependency.md` |
| `pnpm spec <参数…>` | 调用 OpenSpec（规格校验、查看、合并），脚本 `tooling/scripts/spec.mjs` 先关掉它的匿名统计和版本检查。常用：`pnpm spec validate --all --strict --no-interactive`、`pnpm spec list --specs`。不要直接运行 `openspec init` 或 `openspec update` |

## 安装

| 命令 | 跑什么 |
| --- | --- |
| `pnpm install` | 按锁文件安装依赖。发布不满 14 天的版本会被拒绝，这是规则，不要绕过 |
| `pnpm dev` | 从源码打开桌面应用的窗口：先用 esbuild 打包 `apps/desktop`，再启动 Electron。第一次运行会下载 Electron 的二进制（约 100 MB）。默认用真实的 `~/Runyard`；开发和试验请加 `-- --root <临时目录>`（路径要短，如 `mktemp -d /tmp/ry.XXXX`），其余参数见 `apps/desktop/AGENTS.md` |
| `pnpm install --frozen-lockfile` | CI 用的写法：锁文件和 `package.json` 对不上就失败 |

## 检查失败了怎么办

1. 读报错：每条都写了哪里错、怎么改。
2. 按报错改代码或文档，不要改检查本身，也不要加例外。
3. 觉得检查错了，或只有放松规则才能继续：停下来问负责人。

## 模板 CI

`.github/workflows/templates.yml`（拉取请求，只在 `templates/**`、冒烟脚本、`tooling/ci/template-*` 或模板工作流变了才触发；不是必过检查）：全部内置模板跑 `pnpm template:lint`，再只对**改动的模板**、只用工具版本的**上限**跑冒烟，Ubuntu 和 macOS 各一次。运行器、工具定义、冒烟脚本或矩阵脚本变了就测全部模板。`.github/workflows/templates-nightly.yml`（每天 UTC 03:07，也可手动触发）：全部模板、上限和下限，失败时开（或追加评论到）标题为“每晚模板冒烟失败”的 issue。两者共用 `.github/workflows/template-smoke.yml`，由 `node tooling/ci/template-matrix.ts --mode pr|nightly` 按 `templates/builtin/` 现有的模板算矩阵：新模板放进目录就自动进矩阵，不用改工作流。工具的上限写在 `tooling/ci/template-toolchains.json`，下限取模板 `requires` 的下界（补成 X.Y.0，如 Node 22.18.0、Python 3.12.0、Go 1.26.0、pnpm 10.34.6）。本机复现某一格：用对应版本的工具跑 `pnpm template:smoke <模板标识>`。
