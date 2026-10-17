# 证据：创建项目后编辑器 150 ms 内显示入口文件

出处：规格 `DESKTOP-EDITOR-04`（desktop/editor，验证方式 manual）、PRD #prd-quality、issue #266；预加载 Monaco 的决定见 `k8-editor-validation.md`、PR #281。

## 量法

- 对象：打好的应用，不是开发窗口。`pnpm --filter @runyard/desktop package -- --out "$(mktemp -d)" --e2e`（`--e2e` 只多开了 `nodeCliInspect` 这一个开关，好让 Playwright 接上；界面、主进程、编辑器脚本与正式构建相同）。
- 每次测量启动一份全新的应用：`HOME` 指向新建的临时目录，`--root` 在其中；空资源库启动时自动弹出模板选择器，第一次回车选中第一个模板（HTML），名称框拿到焦点后第二次回车创建。
- 计时全在界面页面里用同一个时钟（`performance.now()`）：起点是名称框上那次回车的 `keydown`（捕获阶段）；终点是编辑器的行里出现入口文件 `index.html` 的文字（`MutationObserver`），再等两帧当作已经画出来。两个值都记：`matched`（进入 DOM）和 `painted`（画出来），下表用 `painted`。
- 冷：应用启动后页面加载约 0.2 到 0.4 秒就回车，编辑器预加载可能还没完。热：先等编辑器运行时加载完，再多等 2 秒，再回车。各 10 次，每次都是新启动的应用。
- 脚本：`apps/desktop/e2e/editor-latency.measure.ts`，配置 `e2e/playwright.measure.config.ts`：

```sh
RUNYARD_E2E_APP=<包里的 Runyard 可执行文件> RUNYARD_PERF_OUT=<结果 JSON> RUNYARD_PERF_RUNS=10 \
  pnpm --filter @runyard/desktop exec playwright test --config e2e/playwright.measure.config.ts
```

## 结果（2026-10-18，Apple M3 Max，macOS 27.0.1，Electron 44.5.1，arm64）

| 情况 | 次数 | 中位数 | 最慢 | 最快 |
| --- | --- | --- | --- | --- |
| 冷（画出来） | 10 | 132 ms | 137 ms | 121 ms |
| 热（画出来） | 10 | 137 ms | 145 ms | 126 ms |
| 冷（进入 DOM） | 10 | 116 ms | 126 ms | 114 ms |
| 热（进入 DOM） | 10 | 126 ms | 130 ms | 117 ms |

两种的这 10 次都在 150 ms 内。热比冷慢约 5 到 10 ms，原因没有查。前一轮同样的 10 加 10 次（脚本还没记阶段）：冷中位数 132 ms、最慢 302 ms，热中位数 130 ms、最慢 137 ms；那次冷的最慢值就是下一节的情况。

## 时间花在哪（中位数，从回车算起）

| 阶段 | 冷 | 热 |
| --- | --- | --- |
| 新标签出现（创建项目：管理进程复制模板、状态推回界面） | 66 ms | 73 ms |
| Monaco 的外壳出现 | 102 ms | 111 ms |
| 第一行文字出现 | 108 ms | 117 ms |

约一半是创建项目本身（主进程与管理进程），编辑器从标签出现到有文字约 40 ms。运行时（Monaco、Shiki 语法、TS 线程）在测量时已经加载完或在创建的 66 ms 内完成，没有成为瓶颈。

## 超过 150 ms 的情况

另跑 40 次冷启动（回车在页面加载后约 0.21 秒或约 0.41 秒各一半）：回车在约 0.41 秒时 25 次全部在 118 到 136 ms；回车在约 0.21 秒时 15 次里有 4 次是 295 到 303 ms。原因：预加载（`preloadEditorWhenIdle`）在页面加载后约 0.21 秒开始，Monaco、Shiki 的脚本在主线程上执行一个约 195 ms 的长任务（用 `PerformanceObserver` 的 `longtask` 量到，每次都有），回车恰好落在它开始之前几毫秒时，创建的结果要等它结束才能画出来。

这个窗口是启动后约 0.2 秒内、且和预加载差几毫秒的一次回车，真人操作碰不到（先要看到选择器、选模板、再确认名称）；热的情况不受影响。没有改代码：把 5 MB 的运行时脚本拆开分段执行要改装配方式，不在 #266 范围，且换不来真人能感到的好处。如果以后要消除，办法是把运行时拆成几个脚本、分在多个空闲时间执行。

## 没量的

- 只在一台机器上（M3 Max）量；慢的机器上创建项目的那一半会更长。
- 只量了 HTML 模板的入口文件；中文界面还要先加载中文文字包，没单独量。
