# 更新日志与发版

更新日志（`CHANGELOG.md`）和版本号由 release-please 根据 `main` 上的提交自动维护，没有人手写。
你要做的只有两件事：PR 标题写对（`CONTRIBUTING.md` 的“提交信息和 PR 标题”），以及在发版前写好这一版给负责人看的白话说明。
全仓库只有一个版本号（应用和命令行共用，1.0 之前从 0.1.0 起）；`packages/` 下的包都是私有的、不发布，版本号不动。

## 何时用

- 负责人说要发一个版本，或要看“待发布”PR 时。
- 你发现发版 PR 没出现、没更新，或它的检查没有结果时。
- 新建桌面应用（apps/desktop）或命令行（packages/cli）时（它们要跟着根版本号走）。

## 步骤

### 平时（不用你动手）

1. 每个 PR 合并进 `main` 后，工作流 `.github/workflows/release-please.yml` 自动创建或更新标题为“chore(release): 发布 X.Y.Z”的发版 PR，里面是下一个版本号和更新后的更新日志。
2. 发版 PR 由默认令牌开出来，GitHub 不会为它自动跑检查；工作流在开完之后手动触发 `ci.yml` 和 `security.yml`（`workflow_dispatch`），检查结果记在发版分支的最新提交上，所以六项必过检查会出现在发版 PR 里。每次 `main` 有新提交，发版分支被重写，检查也重跑一遍。

### 发版前：写这一版的白话说明（智能体写，负责人看）

3. 看发版 PR 里的版本号 X.Y.Z 和更新日志。
4. 开一个普通 PR，新增 `docs/releases/<版本>.md`，标题行固定为 `## 这个版本对你意味着什么`，下面写 3 到 6 句中文大白话：这个版本有什么新东西、对负责人意味着什么、有没有要他做的事、还缺什么。不写提交编号，不写技术名词（要写就带解释）。如实写，没有能用的功能就说没有。
5. 这个 PR 合并后，发版 PR 的“缺白话说明”提醒会在下一次运行时消失（它只是提醒，不拦合并）。再把发版 PR 的链接和这段说明一起交给负责人。**智能体不合并发版 PR，由负责人决定什么时候发。**
6. 不要手改 `CHANGELOG.md` 和 `.release-please-manifest.json`：CI 会拒绝除发版 PR 以外改它们的 PR；发版 PR 自己的内容每次更新都会被重写，改了也会丢。说明写在 `docs/releases/`，它在 `main` 上，不会被重写。

### 负责人合并发版 PR 时

7. 合并（只许 squash，和别的 PR 一样）。工作流随后：打标签 `vX.Y.Z`；创建 GitHub Release，正文是该版本的更新日志，最前面接上 `docs/releases/<版本>.md` 的白话说明。不发 npm，不构建、不上传任何产物。

### 新建桌面应用（apps/desktop）或命令行（packages/cli）时

8. 在 `release-please-config.json` 的 `packages["."]` 里加 `extra-files`，让发版 PR 同时改它们的 `package.json` 版本：`{ "type": "json", "path": "<目录>/package.json", "jsonpath": "$.version" }`（命令行同理）。文件不存在时不要提前写，release-please 找不到会报错。

## 验证

- 发版 PR 出现后：`gh pr checks <PR 编号>` 应显示六项必过检查都通过（`lint`、三个 `test`、审计闸门、依赖变更审查）。
- 更新日志里每个已合并的 PR 恰好出现一次，章节顺序和 `release-please-config.json` 的 `changelog-sections` 一致。
- 本地预览（不创建任何东西，只读 GitHub）：在临时目录里 `pnpm add release-please@17.6.0`，再 `release-please release-pr --dry-run --token "$(gh auth token)" --repo-url paddychenc75/runyard --target-branch <分支> --config-file release-please-config.json --manifest-file .release-please-manifest.json`。不要把它加进工作区。
- 出问题时：`gh run list --workflow 发版`，再 `gh run view <编号> --log`。常见原因：仓库设置里没勾选“Allow GitHub Actions to create and approve pull requests”；提交的标题用了全角冒号（release-please 会整条忽略，标题检查会拦住）；`BREAKING CHANGE:` 写成了中文。

## 完成标准

- `docs/releases/<版本>.md` 已在 `main` 上，3 到 6 句。
- 发版 PR 的六项必过检查都有结果且通过，更新日志已核对。
- 没有手改 `CHANGELOG.md`。
- 发版 PR 交给了负责人，没有自己合并。
