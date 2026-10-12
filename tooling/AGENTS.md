# @runyard/tooling

## 用途

仓库自己的检查脚本、构建脚本、钩子和 CI 脚本，以及各包共用的 `tsconfig` 与 `vitest` 基础配置。它不是业务包，不在 `layers.json` 的管辖范围内，业务包只继承它的配置，不导入它的代码。

## 对外暴露什么

没有可导入的接口，只有命令：`pnpm check`（`checks/run.ts`）、`pnpm generate`（`scripts/generate.ts`）、`pnpm deps:lookup`（`scripts/deps-lookup.ts`），以及 CI 和钩子调用的 `ci/`、`hooks/` 里的脚本。配置文件 `tsconfig/*.json` 和 `vitest/base.ts` 供各包继承。

## 本包特有的规则

- 脚本用 TypeScript 写，由 Node 24 直接运行，不加编译步骤。
- 只许用 Node 标准库和 `yaml`；加依赖先问，走 `docs/guides/add-a-dependency.md`。
- 必须在 macOS、Windows、Linux 上都能跑：路径用 `node:path`，比较路径前先统一成 `/`，不依赖 shell 语法，不假设换行是 `\n` 以外的东西。
- 每个检查都有测试，且测试里有一个“应该报错”的用例；检查不对就改检查并补测试，不要放宽或关掉它。
- 检查的报错要用中文，说清哪个文件、哪里不对、怎么改。
- 钩子（`hooks/`）没事可做时必须立刻退出；只许处理刚被改的那一个文件，不许拦住与自己无关的操作。
- `checks/layers.json` 是包依赖规则的唯一出处，改它要先问并附决策记录。

## 子目录地图

- `checks/`：`pnpm check` 的全部检查，入口 `run.ts`；`test-helpers.ts` 造临时仓库
- `scripts/`：开发脚本（生成文档里的表、查依赖版本和公告）
- `ci/`：只在 CI 里用的脚本（标题格式、依赖审计门）
- `hooks/`：Claude Code 钩子，由 `.claude/settings.json` 调用
- `tsconfig/`、`vitest/`：各包共用的基础配置；`vitest/base.ts` 里是唯一的“平台相关测试”跳过机制（`docs/guides/testing.md`），也是除 `packages/platform` 外唯一读运行系统的地方，`platform-branching` 不查 `tooling/`
- `design-render/`：把设计源文件渲染成图片，产物不进仓库

## 测试

```sh
pnpm test --filter @runyard/tooling
```

测试用 `test-helpers.ts` 在临时目录里造最小仓库，不读真实仓库的内容。
