# 0016. 规格驱动开发与 OpenSpec

状态：提议中

日期：2026-10-16

来源：技术设计 §9.6、§12 第 29 项、第 30 项；决策记录 0012

## 背景

负责人 2026-10-12 决定装规格驱动开发工具，“为了以后容易迭代”（§12 第 29 项）。技术设计 §9.6.1 比较后选了 OpenSpec：基本单位是“一次改动”，做完把增量合并进现在的规格，中文能通过严格校验，`init --tools none` 不生成 `CLAUDE.md`。1.14.0 的间接依赖 `braces` 3.0.3 有高危公告 GHSA-vfj7-8cjw-p6xm，GitHub 公告库里没有修复版本；负责人选择装并登记为例外 A（§12 第 30 项）。

## 决定

1. 根目录开发依赖 `@fission-ai/openspec` 精确 1.14.0（发布于 2026-09-30，满 14 天后于 2026-10-16 安装），版本进 catalog，没有安装脚本，不用 `minimumReleaseAgeExclude`。
2. 只通过 `pnpm spec …` 调用，包装脚本 `tooling/scripts/spec.mjs` 无条件设 `OPENSPEC_TELEMETRY=0`、`OPENSPEC_NO_UPDATE_CHECK=1`、`DO_NOT_TRACK=1`，关闭匿名统计和版本检查。
3. `openspec/config.yaml` 与 `openspec/schemas/runyard/` 是我们自己的中文流程：`design` 一样删掉，技术决定写 ADR；`openspec/changes/archive/` 被 `.gitignore` 忽略；`openspec/` 里不放 `AGENTS.md`。
4. 例外 A 登记在 `security/allowlist.toml`：带 `owner_approved`，复核日为合并日起 60 天（2026-12-15）；上游一发布修复版本就升级并删掉，过期不处理则 `deps-policy` 让 CI 变红。

## 后果

- 已手写的 `openspec/specs/` 原样保留，`pnpm spec validate --all --strict --no-interactive` 通过。
- `pnpm audit --prod` 不受影响；全量审计会看到 braces，因已登记而被过滤。
- 不运行 `openspec init`、`openspec update`，不生成任何英文智能体文件；`no-claude-md` 检查照常守着。
- 需要退出时按 §9.6.9 的四步，范围就是引入本工具的提交。

## 被否的方案

- 不装、等上游修复 braces：负责人选了 A，不等。
- 在命令前写环境变量关统计：Windows 上不能用，也容易被智能体绕过。
- 保留 OpenSpec 自带的 `design` 一样：技术决定已有 ADR 这个唯一出处。
