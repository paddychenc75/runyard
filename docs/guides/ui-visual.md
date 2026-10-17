# 界面截图比对

规则的出处是技术设计 §6.7（组件工作台和截图回归）、§8.3（`ui-visual` 一行）、§6.8（伪语言）。这份手册讲日常怎么用。

## 何时用

- 改了 `packages/ui`、`packages/tokens`、`packages/i18n` 里会影响界面的东西，想知道截图比对会不会红
- `ui-visual` 红了，要看懂对照页、决定是修代码还是更新基准图
- 加了新组件，要它的基准图

## 它做什么（背景）

`ui-visual`（`.github/workflows/ui-visual.yml`，`macos-26`）构建工作台，对 `packages/ui/src` 里每个 `*.fixture.tsx` 对应的组件，截五张整表图：浅色×中文、浅色×英文、深色×中文、深色×英文、浅色×伪语言 `en-XA`，和 `packages/ui/visual/__screenshots__` 里按“组件-主题-语言”命名的 PNG 比对。伪语言那一张另做两项检查：**漏网文字**（页面上含字母却不在 `⟦ ⟧` 里的文字，`@runyard/i18n` 的 `collectPageTexts` 加 `findLeakedText`，合起来就是 `scanPageForLeaks`）和**溢出**（元素内容宽度超过可见宽度且没标 `data-truncate`；只查 `<main>` 里的样例，不查工作台自己的顶栏）。另有一个测试核对中文用苹方渲染（字体名认 `PingFang`、`蘋方`、`苹方`，技术设计 §13）。

只在这些改动时跑：`packages/ui`、`packages/tokens`、`packages/i18n`、`apps/desktop/src/renderer`、`pnpm-lock.yaml`、两份工作流文件；main 上同样。它**还不是必过检查**，是否升为必过由负责人决定（#218 的实测显示渲染稳定，建议升为必过）。

## 步骤

### 红了怎么办

1. 打开这次运行的产物 `ui-change-report`，里面的 `ui-change-report.html` 就是“界面变更对照页”：每个变了的组件一行，左边改动前、中间差异、右边改动后；标题是组件名加中文的主题和语言。溢出、漏网文字、字体的失败也在页里，给出原文。
2. 变化不是有意的：改代码，直到绿。
3. 变化是有意的：PR 描述写一句“界面变了什么、为什么”并贴对照页链接；给 PR 加标签 `update-ui-baseline`。`ui-baseline`（`.github/workflows/ui-baseline.yml`）在 `macos-26` 上重新生成基准图，提交到 PR 分支（只改写和旧基准图不一致、超出容差的图，没变的图保持原样；提交信息 `test(ui): 更新界面基准图`），摘掉标签，并手动触发 `ci.yml`、`security.yml`、`ui-visual.yml`（机器人用默认令牌推的提交不触发 `pull_request`，做法和发版 PR 一样，决策记录 0015）。基准图目录在 `.github/CODEOWNERS` 里归负责人，改了它的 PR 必须他批准；一个 PR 变了超过 20 张图时，PR 描述按原因分组说明。
4. 标签加上之后分支又有新提交：`ui-baseline` 会拒绝提交（基准图对不上），摘掉标签再加一次。

### 本地

- 第一次：`pnpm --filter @runyard/ui visual:install`（装 Playwright 管理的 Chromium，约 150 MB，缓存在用户目录）。
- `pnpm ui:visual` 只比对，不更新。本机字体渲染和 `macos-26` 不同，本地失败不一定是真问题，以 CI 为准；它的用处是在推送前抓溢出和漏网文字。
- 本地写不了基准图：`-u`、`--update-snapshots` 或环境变量 `RUNYARD_UI_BASELINE=update` 在没有 `CI` 环境变量时，配置文件直接抛错；缺基准图也算失败（不会悄悄写一张新的）。
- 失败时 `packages/ui/visual` 下的 `.output` 文件夹里有对照页和失败截图（已忽略，不进 git）。

### 体积预算

单张不超过 200 KB，总量不超过 30 MB（技术设计 §6.7）。`visual/budget.ts` 判定，三处用它：`ui-visual` 在比对前跑、`ui-baseline` 在提交前跑、`visual/budget.test.ts` 在 `pnpm test` 里核对提交进仓库的基准图。超了：先缩小样例文件里的内容；机器镜像升级造成整体漂移，单独开一个“只更新基准图”的 PR，不夹在功能 PR 里；预算用完再向负责人提 Git LFS。

### 缩放：为什么是 1×

技术设计 §6.7 要求在 M2 开头按实测定 1× 还是另存 2×。2026-10-16 在本机（macOS，Playwright 1.63.0 自带的 Chromium，视口宽 480）对三个组件加 `UserText` 的 20 张图实测：

| 档位 | 总量 | 最大一张 | 结论 |
| --- | --- | --- | --- |
| 1× | 1.6 MB | 约 185 KB（`GlassSurface` 伪语言） | 都在 200 KB 之内 |
| 2× | 4.7 MB | 约 670 KB | 单张超预算的有 10 张（Button、GlassSurface 各 5 张） |

所以用 1×（Playwright 默认）。同时做了两处让图变小的改动：截图视口宽 480（样例是小零件，不需要宽屏）；玻璃组件背后的彩色底图从平滑渐变改成硬边的竖向色块（无损 PNG 压不动渐变，原来 `GlassSurface` 一张 545 KB，改后 150 到 185 KB；硬边在玻璃后被模糊成一道过渡，更容易看出模糊半径）。数字是本机测的，CI 上的大小以 `ui-baseline` 提交的为准，仍受 `budget.ts` 把关。

### 为什么基准图 PR 里会混进没变的图（#218）

现象：PR #215 多了 50 张、#221 动了 105 个文件，其中不少组件根本没改。2026-10-17 在 `macos-26` 上实测，结论分两层：

- 渲染本身是确定的。同一提交、同一任务里连生成两次：105 张字节完全一致；两个不同任务各生成一次：104 张字节一致，只有 `ConfirmDialog-dark-zh-CN` 有 34 个像素差 16 以内（低于逐像素阈值，比对时不算差异）；与仓库里的基准图相比也是同一张。字体、抗锯齿、毛玻璃、时间都不是原因，PNG 元数据和编码也没有抖动。
- 真正的原因是工作台自己的版面。左侧组件列表那一列原来是 `auto` 宽，宽度由最长的组件名决定；右边“状态表”（被截图的 `<main>`）是剩下的宽度。每新增一个名字更长的组件（`ConfirmDialog`、`AlertDialog`），所有组件的图宽就差 1 到 6 像素，内容整体平移，几乎每张图都超出容差。再叠加 `baseline=update` 原来用 `updateSnapshots: "all"`，把每张图都重新写一遍。

做了两件事：列表列定宽（`workbench.css`，名字过长用省略号），新增组件不再影响别的组件的图；基准图更新改用 `updateSnapshots: "changed"`，只改写比对不过的图，实测第二次运行改写 0 张。容差一点没放宽。往后基准图 PR 里出现没改的组件的图，就是真的变了，要在 PR 描述里说明原因。

### 判定的容差

`maxDiffPixels: 20`，单个像素的颜色阈值用 Playwright 默认值（技术设计 §13“留一点容差”）。K15 在同一镜像上实测逐像素一致，只测了很小的静态页；用到毛玻璃、阴影的组件是否同样稳，要看 `main` 上连续几次运行。若同一份代码在 CI 上两次比对结果不同，开 `flaky` issue，不要加大容差。

## 验证

- `pnpm ui:visual` 在本机只比对（缺基准图或字体不同会失败，以 CI 为准）；`pnpm --filter @runyard/ui test` 通过（含 `visual/` 里的预算、溢出扫描、对照页单元测试）。
- 想确认流水线能咬住：故意改一个组件的样式（比如把 `Button` 的圆角改成 4px），`ui-visual` 应变红并产出对照页；改回去。
- `pnpm verify` 通过。

## 完成标准

- 界面变了的 PR：对照页看过，PR 描述有“界面变了什么、为什么”和对照页链接，基准图由 `ui-baseline` 提交（不是手工提交）。
- 基准图在预算之内，没有新增“放宽容差”或跳过某个组合的改动；确实需要的先问负责人。
