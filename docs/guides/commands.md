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
| `pnpm template:smoke <模板标识> [--node <node 路径>] [--pm pnpm\|npm]` | 内置服务类模板的冒烟：复制到系统临时目录，按运行器真的安装依赖、类型检查、构建、启动、等 HTTP 响应、改源文件看热更新（进程不重启）、停止并确认端口释放。**需要网络**，不在 `pnpm test` 和 `pnpm verify` 里；声明范围的下限和上限版本各跑一次，见 `docs/guides/add-template.md` |
| `pnpm deps:lookup <包名>` | 列出一个依赖最近 10 个稳定版本、发布日期、距今天数，并查 OSV 和 GitHub 公告库。用法见 `docs/guides/add-a-dependency.md` |
| `pnpm spec <参数…>` | 调用 OpenSpec（规格校验、查看、合并），脚本 `tooling/scripts/spec.mjs` 先关掉它的匿名统计和版本检查。常用：`pnpm spec validate --all --strict --no-interactive`、`pnpm spec list --specs`。不要直接运行 `openspec init` 或 `openspec update` |

## 安装

| 命令 | 跑什么 |
| --- | --- |
| `pnpm install` | 按锁文件安装依赖。发布不满 14 天的版本会被拒绝，这是规则，不要绕过 |
| `pnpm install --frozen-lockfile` | CI 用的写法：锁文件和 `package.json` 对不上就失败 |

## 检查失败了怎么办

1. 读报错：每条都写了哪里错、怎么改。
2. 按报错改代码或文档，不要改检查本身，也不要加例外。
3. 觉得检查错了，或只有放松规则才能继续：停下来问负责人。
