# 0015. CHANGELOG 自动维护与发版流程从 M5 提前

状态：提议中

日期：2026-10-12

来源：技术设计 §8.4；决策记录 0011、0012；负责人 2026-10-12 的要求“为了保障好工程化需要维护好 CHANGELOG”

## 背景

技术设计 §8.4 早就选了 release-please（全仓库一个版本号，Conventional Commits，中文主题），但排在最后一个里程碑，仓库至今没有 `CHANGELOG.md`。负责人要求现在就维护好。有一个已知障碍：用默认的 `GITHUB_TOKEN` 创建的 PR 和推送，GitHub 不会触发 `pull_request` 工作流，而 `main` 的规则集要求六项检查，发版 PR 的检查永远不出现，永远合并不了。

## 决定

1. 用 `googleapis/release-please-action` v5.0.0（固定提交哈希，打包 release-please 17.6.0），配置在 `release-please-config.json` 和 `.release-please-manifest.json`；工作流 `.github/workflows/release-please.yml` 只在推送到 `main` 时运行。
2. **必过检查的办法：不用密钥。** 发版 PR 由 `GITHUB_TOKEN` 开出后，工作流的另一个任务（只有 `actions: write`）用 `workflow_dispatch` 在发版分支上手动触发 `ci.yml` 和 `security.yml`（官方文档：`workflow_dispatch` 和 `repository_dispatch` 不受“`GITHUB_TOKEN` 的事件不触发新运行”限制）。**但手动触发产生的检查运行不计入 PR 的合并条件**：2026-10-12 在 PR #78 上实测，六项检查都成功，PR 的检查汇总仍为空，合并状态仍是 BLOCKED；手工补上同名的提交状态后立刻变为 CLEAN。所以这两个工作流的最后一个任务 `report`（只在手动触发时运行，`statuses: write`）把每个任务的真实结果原样同步成同名的提交状态（`tooling/ci/report-statuses.ts`）；失败就记失败。仓库设置要打开 Actions 的“Allow GitHub Actions to create and approve pull requests”（规则集不要求批准，这一项不削弱它）。
3. 版本：1.0 之前，`bump-minor-pre-major` 和 `bump-patch-for-minor-pre-major` 都开（`feat` 升修订号，破坏性改动升次版本号，不会跳到 1.0）；首个版本 `initial-version` 为 0.1.0；`include-component-in-tag: false`，标签是 `v0.1.0`。只有根 `package.json` 跟版本号走；`packages/*` 私有且不发布，不改版本号；`apps/desktop`、`packages/cli` 建立时加进 `extra-files`。
4. 更新日志：`changelog-sections` 覆盖标题检查允许的全部 11 个 type，一个都不隐藏（这个阶段要完整的工程记录），章节名中文；测试 `tooling/ci/changelog-sections.test.ts` 保证两边一一对应。`BREAKING CHANGE` 小节的标题是 release-please 写死的英文，改不了。
5. 白话说明放 `docs/releases/<版本>.md`（在 `main` 上，不会被发版 PR 重写）；发版时工作流把它接在 GitHub Release 正文最前面。PR 正文和发版分支上的任何手写内容每次更新都被覆盖，所以不放那里。
6. 现阶段“发版”只有：打标签、建 GitHub Release（正文是更新日志）、更新日志写进 `main`。不发 npm，不构建，不上传产物。
7. `CHANGELOG.md` 和 `.release-please-manifest.json` 只许发版 PR 改，CI 里 `check-changelog-edit.ts` 拦其他 PR。

## 后果

- 发版 PR 每次更新都触发一轮完整 CI（含 macOS 和 Windows 任务）；仓库是公开的，运行免费。
- 按 GitHub 的新规则，默认令牌开的 PR 的 `pull_request` 运行会停在“等待批准”，页面上会看到两条这样的运行；不要批准它们（批准只是重跑一遍），也不影响合并。
- 发版 PR 的“PR 标题”“提交信息”两项检查不会对它运行（它们只在 `pull_request` 事件里跑），其余五项和 `lint` 里的 Biome、`pnpm check` 都跑。
- 合并发版 PR 的是负责人，不是智能体；之后 `main` 上的 CI 正常运行（合并者是人，会触发）。
- `.release-please-manifest.json` 由 release-please 写成单行，不符合 Biome 的格式，所以排除在 Biome 之外（第一次真实运行时发现，发版分支上的 `lint` 因此失败）。
- 新增 type 必须同时改 `check-title.ts` 和 `release-please-config.json`，否则测试失败。
- 历史提交的 type 写错无法改（例如 `feat(spikes)` 其实是技术验证），第一个版本里它们按原样出现。
- 若这个办法在真实运行中不能让必过检查通过，退路是负责人建一个细粒度个人令牌密钥传给 Action（`token` 参数）；那时用新记录取代本条。

## 被否的方案

- 细粒度个人令牌或 GitHub App 令牌存成密钥：官方推荐，但要负责人建令牌并定期更换，且令牌能力比 `actions: write` 大；能不用就不用。
- 只靠手动触发的检查运行（第一版做法）：实测不计入合并条件，PR 一直 BLOCKED。
- 手动点“Run workflow”或手动推一个空提交让检查出现：每次都要人做，违背自动维护。
- 在规则集里去掉这些必过检查或加绕过人：削弱 `main` 的保护，不允许。
- 在发版 PR 的分支上手写白话说明：release-please 每次更新都会重写分支，改动会丢。
