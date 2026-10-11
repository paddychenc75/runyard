# 命令表

在仓库根目录运行。需要 Node 24（版本见 `.node-version`）和 pnpm（版本见根 `package.json` 的 `packageManager`）。命令的唯一出处是根 `package.json` 的 `scripts`；这张表只解释每条跑什么，`docs-commands` 检查保证两边一致。

## 验证改动

| 命令 | 跑什么 | 什么时候用 |
| --- | --- | --- |
| `pnpm verify` | 依次：`pnpm lint`、`pnpm typecheck`、`pnpm check`、受影响的包的单元测试（用 turbo 对比 `main` 分支算出受影响的包） | 说“做完了”之前必跑。目标：本地 2 分钟内 |
| `pnpm test --filter <包名>` | 只跑一个包的单元测试，如 `pnpm test --filter @runyard/protocol` | 改某个包的过程中 |
| `pnpm test` | 全部包的单元测试 | 改了共用的东西，或想确认全部通过 |
| 结束回复时的钩子 | 只跑 `tsc -b` 和 `pnpm check`，不跑测试。不通过就让智能体继续修；超过 90 秒放行并提示 | 自动运行（Claude Code），脚本是 `tooling/hooks/on-stop.ts` |

`pnpm verify` 不含全量测试以外的慢测试；模板冒烟测试和端到端测试随对应的包加入时，在这里各加一行。

## 单项

| 命令 | 跑什么 |
| --- | --- |
| `pnpm lint` | Biome 检查格式和代码规则，只检查不修改 |
| `pnpm format` | Biome 按规则重排格式（会改文件） |
| `pnpm typecheck` | `tsc -b`，按 project references 检查全仓库的类型 |
| `pnpm check` | 全部仓库检查，脚本在 `tooling/checks/`，清单见 `tooling/checks/run.ts`。每条报错都写明哪里错、怎么改 |
| `pnpm generate` | 重新生成由脚本生成的文档内容（现在是根 `AGENTS.md` 里的包依赖表）。改了 `tooling/checks/layers.json` 或新建了包之后运行 |
| `pnpm deps:lookup <包名>` | 列出一个依赖最近 10 个稳定版本、发布日期、距今天数，并查 OSV 和 GitHub 公告库。用法见 `docs/guides/add-a-dependency.md` |

## 安装

| 命令 | 跑什么 |
| --- | --- |
| `pnpm install` | 按锁文件安装依赖。发布不满 14 天的版本会被拒绝，这是规则，不要绕过 |
| `pnpm install --frozen-lockfile` | CI 用的写法：锁文件和 `package.json` 对不上就失败 |

## 检查失败了怎么办

1. 读报错：每条都写了哪里错、怎么改。
2. 按报错改代码或文档，不要改检查本身，也不要加例外。
3. 觉得检查错了，或只有放松规则才能继续：停下来问负责人。
