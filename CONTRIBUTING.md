# 参与贡献

欢迎提 issue 和 PR。**英文的 issue 和 PR 同样欢迎**：维护者主要用中文，但英文的描述不会被拒绝；PR 标题请照下面的格式写，主题尽量用中文，写不好时先写英文也可以，CI 不检查主题用什么语言。

仓库里给开发者看的内容（代码注释、提交信息、文档）用中文；`README.md` 是英文，`README.zh-CN.md` 是中文，改其中一个的内容时请同步另一个。

## 环境

- Node：版本写在 `.node-version`（24.21.0）。`package.json` 的 `engines` 和 `pnpm-workspace.yaml` 的 `engineStrict` 会让版本不符的安装直接失败。
- pnpm：版本写在 `package.json` 的 `packageManager` 字段（11.28.0）。CI 从这个字段读版本，不另写。
- 换行：全部文本文件用 LF（见 `.gitattributes`），Windows 上也一样（Windows 的 CI 任务会检查这一点）。不要在 Git 里打开会改换行的自动转换。

```sh
pnpm install --frozen-lockfile
```

## 常用命令

这些命令都在仓库根目录运行，CI 跑的就是同样的命令：

| 命令 | 做什么 |
| --- | --- |
| `pnpm lint` | Biome 检查（格式和规则） |
| `pnpm format` | 用 Biome 自动格式化 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm check` | 仓库自己的检查（目前有分层、依赖策略、依赖记录） |
| `pnpm test` | 全部测试：先单元阶段，再进程阶段（起真进程的测试单独、一次一个包地跑） |
| `pnpm test:unit`、`pnpm test:process` | 只跑其中一个阶段，可加 `--filter <包名>` |
| `pnpm verify` | 提 PR 前跑一遍：lint、typecheck、check，再测试有改动影响的部分 |
| `pnpm deps:lookup <包>` | 查某个包的版本、发布日期、已知公告 |

## 提交信息和 PR 标题

格式：`type(scope): 主题`，主题写中文。例如：

```
feat(core): 增加运行状态机
fix(platform): 修复 macOS 上进程树未完全结束
ci(repo): 增加 PR 流水线
```

- `type` 可选：`feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`、`revert`。
- `scope` 可以省略；写的话必须在列表里：`repo`、`deps`、`ci`、`docs`、`security`、`release`、`spec`、`tooling`、`desktop`、`site`、`protocol`、`platform`、`core`、`supervisor`、`client`、`cli`、`tokens`、`ui`、`i18n`、`testing`、`templates`。列表在 `tooling/ci/check-title.ts`，新增包时一起改。
- 冒号后要有一个空格，主题不能为空，整条标题不超过 72 个字符（一个汉字算一个）。
- **冒号必须是半角的“:”，不能是全角的“：”。** release-please 会整条忽略带全角冒号的提交或 PR 标题，这次改动就不会进更新日志和版本号（决策记录 0011）。`check-title` 会拒绝这样的标题。主题里可以出现全角冒号，只有 `type(scope)` 后面的那个不行。
- 破坏性改动在冒号前加 `!`，或在提交正文里写一行 `BREAKING CHANGE: 说明`（`BREAKING CHANGE` 必须是英文原词，写“破坏性变更：”不会被认出来；冒号后面的说明可以用中文）。
- 合并方式只有 squash：一个 PR 压成一个提交，进入 `main` 的提交信息来自 PR 标题，所以**PR 标题**必须符合格式。
- 提交信息末尾的 `Co-Authored-By:` 写实际使用的模型（不同的提交可以是不同的模型），不要照抄别处的名字。

CI 会检查 PR 标题和 PR 里每个提交的第一行。本地检查：

```sh
node tooling/ci/check-title.ts --title "feat(core): 增加运行状态机"
node tooling/ci/check-title.ts --range origin/main..HEAD
```

CI 还会查 PR 有没有把别人最近合并的改动整个文件改回去（`tooling/ci/check-rollback.ts`：同一个提交被撤销至少 3 个文件才报；标题 type 是 `revert` 的 PR 不查）。本地：`node tooling/ci/check-rollback.ts --base origin/main --head HEAD --title "<标题>"`。被报时说明分支里有过期的文件，用 `git merge origin/main` 或 `git rebase origin/main` 逐处解决冲突，不要整个文件取一边。

## 更新日志和发版

`CHANGELOG.md` 由 release-please 根据 `main` 上的提交自动生成，**不要手改**（CI 会拒绝除发版 PR 以外改它的 PR）。全仓库一个版本号，1.0 之前从 0.1.0 起；`feat` 升修订号，破坏性改动升次版本号。完整手册在 `docs/guides/release.md`，决定的理由在决策记录 0015。

- 每个 PR 合并后，工作流 `.github/workflows/release-please.yml` 创建或更新一个标题为“chore(release): 发布 X.Y.Z”的发版 PR（“待发布”），里面是下一个版本号和更新后的更新日志。**合并这个 PR 就是发版**：打标签 `vX.Y.Z`、建 GitHub Release、更新日志写进 `main`。现阶段不发 npm、不构建、不上传产物。发版由负责人决定，智能体不合并发版 PR。
- 更新日志按提交的 type 分章节，章节名是中文，全部 type 都显示：新功能（`feat`）、修复（`fix`）、性能（`perf`）、回退（`revert`）、重构（`refactor`）、文档（`docs`）、测试（`test`）、构建与依赖（`build`）、持续集成（`ci`）、代码风格（`style`）、杂项（`chore`）。所以 PR 标题的 type 要选对，它就是更新日志里的分类；增删 type 时，`tooling/ci/check-title.ts` 和 `release-please-config.json` 要一起改（`tooling/ci/changelog-sections.test.ts` 会核对）。
- 发版 PR 由默认令牌开出，GitHub 不为它自动跑检查；工作流开完后手动触发 `ci.yml`、`security.yml`，它们的最后一个任务 `report` 把真实结果同步成同名的提交状态，必过检查才算数（手动触发的检查运行本身不计入合并条件）。页面上两条“等待批准”的运行不用管。仓库设置里必须打开 Settings → Actions → General → “Allow GitHub Actions to create and approve pull requests”。
- 每个版本另有一段给负责人看的白话说明，写在 `docs/releases/<版本>.md`（发版 PR 的内容每次都会被重写，所以不能写在它里面）。谁写、何时写见 `docs/guides/release.md`。

## 怎么合并进 `main`

变更只能经 pull request 进入 `main`，不直接推送（决策记录 0012）：

- `main` 受规则集保护：必须通过六项检查才能合并——`lint` 一项、`test` 三项（Ubuntu、`macos-26`、`windows-2025`）、审计闸门（`audit-gate`）、依赖变更审查；不许强制推送；没有任何人可以绕过；只许 squash 合并。不要求别人批准，因为负责人是唯一的维护者。
- 六项检查通过后 PR 自动合并，负责人在合并之后再看。所以会改变行为的改动，要在规格阶段先得到负责人的同意，不能靠合并后的评审把关。
- 检查没过就不会合并：修好再推送，不要想办法绕过。

## 偶发失败的测试

必过检查失败了，不许“直接重跑”：先开一个带 `flaky` 标签的 issue，附上失败的运行链接、测试名和系统，再重跑。同一个测试偶发失败两次，就修好它，或者写进有原因、issue 编号和到期日的隔离名单（`tooling/vitest/quarantine.json`，经 PR 评审；过了到期日 `pnpm check` 会失败）。细则见 `docs/guides/testing.md`。

## 依赖

规则的完整说明在技术设计 §8.6（`docs/product/03-tech-design.md`）。日常要记住的：

- 版本写精确值，不写 `^`、`~`、`latest`；共用的版本放在 `pnpm-workspace.yaml` 的 `catalog` 里。
- 发布不满 14 天的版本装不上（`minimumReleaseAge`），不要用 `minimumReleaseAgeExclude` 绕过；安全修复的例外条件见 §8.6.1 规则 3。
- 依赖的安装脚本默认不执行；放行要在 `allowBuilds` 里写明，并在 PR 里说明理由。
- 加或改依赖时，同一个 PR 里更新 `docs/architecture/dependencies.md`；`pnpm check` 里的 `deps-policy` 和 `deps-record` 会核对。
- 选版本前先用 `pnpm deps:lookup <包>` 查发布日期和公告。
- 审计的已知公告放行只能写在 `security/allowlist.toml`，每条要有理由和到期日，格式见文件开头的说明。

## CI 做什么

| 工作流 | 触发 | 内容 |
| --- | --- | --- |
| `.github/workflows/ci.yml` | 每个 PR、`main` | `lint`（Ubuntu）：PR 标题和提交信息格式、非发版 PR 不许改 `CHANGELOG.md`、Biome、`pnpm check`。`test`（Ubuntu、`macos-26`、`windows-2025`，三个都必须通过）：类型检查、单元测试、进程测试（同一个任务里的两个步骤）；macOS 和 Windows 上另外重跑 Biome 和 `pnpm check`。第一版只支持 macOS：`windows-2025` 只跑与系统无关的代码（检查脚本、`protocol`、`i18n` 等不需要平台实现的包），依赖平台实现的测试在 macOS 和 Ubuntu 上跑，在 Windows 上通过唯一一套文档化的机制（标签 `platform-dependent`，暂定名，以测试手册为准）跳过，不在测试里写 `process.platform` 判断（决策记录 0013） |
| `.github/workflows/security.yml` | 每个 PR、`main` | 依赖变更审查（`dependency-review-action`）；`pnpm audit` 审计闸门（`tooling/ci/audit-gate.ts`，只统计 high 和 critical 的正式依赖，按 `security/allowlist.toml` 过滤） |
| `.github/workflows/release-please.yml` | 推送到 `main` | 维护发版 PR 和更新日志；合并发版 PR 后打标签、建 GitHub Release；开完发版 PR 后手动触发 `ci.yml` 和 `security.yml`（它们另有 `workflow_dispatch` 触发）。权限按任务最小化，不用任何密钥 |
| `.github/workflows/nightly-security.yml` | 每晚（`main`） | 含开发依赖的全量审计、`pnpm audit signatures`、OSV-Scanner（只报告，结果在仓库的 Security 页）；失败时自动开 issue（标签 `security`） |

所有工作流默认只有 `contents: read` 权限，PR 上跑的任务不用任何密钥，用的是 `pull_request` 事件（不是 `pull_request_target`）。

### 本地复现 CI

```sh
pnpm install --frozen-lockfile
pnpm lint && pnpm check && pnpm typecheck && pnpm test:unit && pnpm test:process
pnpm audit --prod --json > audit.json; node tooling/ci/audit-gate.ts --file audit.json
```

## CI 组件（第三方 Action）

所有 Action（包括 GitHub 官方的 `actions/*`）都固定到完整提交哈希，版本写在行尾注释里；选版本的规则与依赖相同（发布满 14 天、在维护的版本线、先查公告）。升级走 Renovate 的 PR，不要手改哈希。

查询日期 2026-10-12。“公告”一列：GitHub 公告库（`gh api "advisories?ecosystem=actions&affects=<仓库>"`）、该仓库自己的安全公告页（`gh api repos/<仓库>/security-advisories`）、OSV（生态 `GitHub Actions`，按所选版本查）三处，结果都是 0 条。

| Action | 版本 | 提交哈希 | 发布日期 | 为什么是这个版本 |
| --- | --- | --- | --- | --- |
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-20 | 7 线最新，发布 84 天；7.0.0 已满 90 天 |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` | 2026-07-14 | 7.1.0 发布于 2026-10-08，只有 4 天，不选；7.0.0 刚满 90 天 |
| `actions/setup-python` | v7.0.0 | `5fda3b95a4ea91299a34e894583c3862153e4b97` | 2026-07-20 | 7 线最新，发布 88 天；只在模板冒烟（`template-smoke.yml`）里装模板要的 Python 版本。公告三处均 0 条（2026-10-16 查） |
| `actions/setup-go` | v7.0.0 | `b7ad1dad31e06c5925ef5d2fc7ad053ef454303e` | 2026-07-16 | 7 线最新，发布 92 天；同上，装模板要的 Go 版本。公告三处均 0 条（2026-10-16 查） |
| `pnpm/action-setup` | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` | 2026-09-05 | 6.0.0 起支持 pnpm 11，缺省版本读 `packageManager` 字段；发布 37 天 |
| `actions/dependency-review-action` | v5.0.0 | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` | 2026-05-08 | 当前最新，运行时 node24；公共仓库免费 |
| `google/osv-scanner-action`（可复用工作流） | v2.6.0 | `a345acffa64b0eaede81a3d9aae6141214d9c8fc` | 2026-09-14 | 当前最新，发布 28 天；它内部再引用的 Action 也是固定哈希 |
| `googleapis/release-please-action` | v5.0.0 | `45996ed1f6d02564a971a2fa1b5860e934307cf7` | 2026-04-22 | 当前最新，发布 173 天，运行时 node24，仍在维护；打包的 release-please 库是 17.6.0。公告三处均 0 条 |

## 报告安全问题

见 [SECURITY.md](SECURITY.md)。不要在公开的 issue 里写漏洞细节。

## CI 目前没有覆盖的

- 许可证检查：技术设计 §8.6.3 把它列在 `security` 任务里，但没有给出允许或禁止的许可证清单，所以 `dependency-review-action` 的 `license-check` 先关闭，等清单定下来再开。
- 每晚对 `docs/architecture/dependencies.md` 每一行重新查公告：需要解析该文件，等格式稳定后加入每晚任务。
- 模板的审计：模板还不存在。
