# Electron 版本评估：M2 用 44 还是升级（issue #198）

对应技术设计 §8.1、§8.6.1 规则 5、§13 和 issue #198。查询日期 2026-10-18（本机 UTC 时间 2026-10-17 22:2x）。本文只做评估，不改代码、不加依赖、不动 `dependencies.md`；所有数字都来自下面列出的来源，没有实测的地方单独标出。

## 结论

1. **M2 继续用 Electron 44.5.1，现在不升。** 44 线没有任何影响 44.5.1 的公告；比 44.5.1 新的补丁没有一个满 14 天，也没有一条“修复公告”的安全例外可用（规则 3 要求公告写明修复版本）。
2. **公开发布不放在 44 上。** 44 线 2027-03-02 停止支持；按规则 5 公开发布时至少还剩 3 个月，即最晚 2026-12-02 前发布才能留在 44。这个日期很可能赶不上，所以真正的目标版本是 45。
3. **Electron 45 在 2026-11-19 前后评估并升级**（45.0.0 计划 2026-10-20 发布，满 30 天），升级走 `add-a-dependency` 手册，单独一个 PR，下面“升级 45 时要做的事”是清单。45 线 2027-04-27 停止支持，届时还剩 5 个多月，满足规则 5 对选定和发布的要求。
4. **46 不考虑作为 v1 起点**：46.0.0 计划 2027-01-05，满 30 天是 2027-02-04。但 46 有一项对我们有影响的行为变化（`utilityProcess` 的 `kill()`），见下面“向前看”，可以提前在 44/45 上做掉。

## 一、发布日期与规则

数据：npm 注册表的 `time` 字段（`npm view electron time`）、GitHub 发布页、Electron 发布时间表（releases.electronjs.org/schedule 的数据）、Chromium 时间表（chromiumdash 的 `fetch_milestone_schedule`）。

| 大版本 | Chromium | 内置 Node | 首个稳定版 | 停止支持 | 状态（2026-10-18） |
| --- | --- | --- | --- | --- | --- |
| 43 | 150 | 24.17 | 2026-06-30 | 2027-01-05 | 不能退回：不足 4 个月（规则 5 ③） |
| 44 | 152 | 24.21（44.8.0 起 24.22.0） | 2026-08-25 | 2027-03-02 | 现用；已发布 54 天 |
| 45 | 156 | 24.22.0 | 计划 2026-10-20（时间表里这一格还空着；Chromium 156 的稳定日是 2026-10-20，Electron 稳定版与它同日） | 2027-04-27 | npm 上只有 `45.0.0-beta.5`（2026-10-16），没有稳定版 |
| 46 | 160 | — | 计划 2027-01-05（Chromium 160 稳定日） | 2027-06-22 | 在 `main` 上，`46.0.0` 的 beta 计划 2026-12-03 |

官方支持政策：只支持最新三个稳定大版本（`electron-timelines.md`），所以 44 线在 47 发布（2027-03-02）时停止支持。

按规则 5 推算：

| 条件 | 44 | 45 | 46 |
| --- | --- | --- | --- |
| 满 30 天（规则 5 ②） | 已满 | 2026-11-19（以 45.0.0 实际发布日为准） | 2027-02-04 |
| 选定时距停止支持至少 4 个月 | 2026-11-02 之后不再满足（我们已经在用，所以只影响“新选 44”） | 2026-11-19 时还剩 5 个月 8 天，满足 | 满足 |
| 公开发布时至少还剩 3 个月 | 须在 2026-12-02 前发布 | 须在 2027-01-27 前发布 | 须在 2027-03-22 前发布 |

规则 4 的 90 天对 Electron 缩短为 30 天（规则 5 ②）；如果硬按 90 天算，45 要到 2027-01-18、46 要到 2027-04-05，会让我们永远落后一个大版本，所以不用。

## 二、44 线的公告与补丁

**公告（三处）：**

- A：OSV `POST /v1/query`，`electron@44.5.1`、`44.6.0`、`44.7.2`、`44.9.0` 全部返回 `{}`（无公告）。
- B：GitHub 公告库 `advisories?ecosystem=npm&affects=electron@44.5.1` 返回空。
- C：`gh api repos/electron/electron/security-advisories` 共 69 条，范围覆盖 44 线的 11 条，修复版本都不晚于 44.5.0：

| 公告 | 严重度 | 44 线修复版本 |
| --- | --- | --- |
| GHSA-gr2m-v5gq-v685、GHSA-9qh4-3jw8-366w、GHSA-j84w-jfhq-vhvj | 高 | 44.0.0-beta.5 |
| GHSA-qmv3-fv6v-rmhq | 高 | 44.0.0-beta.6 |
| GHSA-98mx-cjp9-gchm | 低 | 44.1.1 |
| GHSA-997q-gvvc-jwmx、GHSA-fw47-9c62-h3vw、GHSA-2p8c-gr87-2676 | 中 | 44.3.0 |
| GHSA-3qxv-5xgr-q7w9、GHSA-h3v5-h239-pg29 | 低 | 44.4.3 |
| GHSA-x562-297c-g43g | 中（2026-10-15 公布） | 44.5.0 |

**44.5.1 仍然是已修补的版本**：11 条里没有任何一条的修复版本晚于 44.5.0。45 线同样：唯一晚于 45.0.0-alpha.9 的是 GHSA-x562（alpha.13 修复），现在的 beta.5 已含。

**比 44.5.1 新的补丁（npm 发布时间，UTC）：**

| 版本 | 发布 | 满 14 天 | 满 15 天（挑选线） | 主要内容 |
| --- | --- | --- | --- | --- |
| 44.5.1 | 2026-09-30 06:59 | 已满（18 天） | 已满 | 现用 |
| 44.6.0 | 2026-10-06 22:39 | 2026-10-20 22:39 | 2026-10-21 | 修 macOS 启动崩溃（系统拒绝登记睡眠通知时）等；Chromium 仍是 152.0.7977.130 |
| 44.7.0 | 2026-10-07 19:26 | 2026-10-21 19:26 | 2026-10-22 | 后移上游 Chromium/V8/Skia 修复 |
| 44.7.1 / 44.7.2 | 2026-10-13 / 10-14 | 2026-10-27 / 10-28 | 2026-10-28 / 10-29 | Chromium 升到 152.0.7977.149；44.7.2 修 macOS 上“后台应用点击被丢弃”等 |
| 44.8.0 / 44.9.0 | 2026-10-15 / 10-17 | 2026-10-29 / 10-31 | 2026-10-30 / 11-01 | Chromium 152.0.7977.167、内置 Node 24.22.0；44.8.0 修 `utilityProcess` 退出前最后一条消息丢失 |

**没有满足条件的更新补丁：** 没有一个比 44.5.1 新的 44.x 满 14 天。也没有安全例外的依据：新补丁的发布说明里只有“后移 Chromium 修复”和 Chromium 小版本升级，没有一条 Electron 公告写明它们是修复版本（规则 3 ① 要求公告写明）。**因此本 PR 不改 `dependencies.md`，也没有做 44.x 补丁升级。**

需要留意（不是阻塞项）：44.5.1 的 Chromium 是 152.0.7977.130，44.9.0 已是 .167。Chromium 自己的安全修复会进 Electron 补丁，但 Electron 不一定为此发公告，所以“没有公告”不等于“没有已知的 Chromium 漏洞”。建议在 2026-10-29 之后（44.7.2 满 15 天，带 Chromium .149）做一次普通的补丁升级，走 `add-a-dependency` 手册，查三处公告、跑 e2e 和 package；如果其间 Electron 为 44 线发布了写明修复版本的公告，则按规则 3 立即处理。

## 三、45 的变化对我们的影响

来源：Electron 官方文档里的 `breaking-changes.md`（electron/electron 仓库）的 “Breaking API Changes (45.0)”，对照 `apps/desktop` 的代码（2026-10-18 的 `main`）。

| 45 的变化 | 我们的用法 | 影响 |
| --- | --- | --- |
| 沙箱预加载脚本里移除 `events`、`timers`、`url` 的垫片和 `Buffer`、`setImmediate` | `src/preload/` 只 `import … from "electron"`（`contextBridge`、`ipcRenderer`），自己的文件里没有用到这些 | 无影响；升级时仍要看一眼打包后的 `dist/preload`，确认 esbuild 没有把依赖 `Buffer` 的包打进去 |
| 沙箱预加载里 `ipcRenderer` 改用原生 `EventEmitter` | 只用 `invoke`、`on`、`send` 一类实例方法 | 无影响（官方说实例 API 不变） |
| ASAR 里的文件描述符只能经 `fs` 使用 | `asarUnpack: ["**/node_modules/node-pty/**"]`，node-pty 和 `spawn-helper` 在 asar 之外；`runyard`、管理进程、命令行也在 asar 之外 | 无影响；Monaco、界面文件走 `app://runyard/` 协议读 asar，不拿裸描述符 |
| `window.open()` 子窗口从不沙箱窗口得到独立沙箱进程 | 主窗口和预览视图都 `sandbox: true`、`contextIsolation: true`，主窗口 `setWindowOpenHandler` 一律拒绝，预览走 `onWindowOpen` 守卫 | 无影响（没有不沙箱的窗口） |
| 屏幕捕获权限改报 `display-capture` | 预览的权限策略只放行 `clipboard-sanitized-write` | 无影响 |
| `safeStorage` 同步方法弃用 | 没有使用（渲染进程里同名的 `safeStorage()` 是自己的 `localStorage` 包装） | 无影响 |
| `contentTracing`、`requestStorageAccessFor` | 没有使用 | 无影响 |

结论：**文档层面 45 没有破坏我们的 API**。`WebContentsView`（预览）、`utilityProcess`（pty-host，`utilityProcess.fork` + `child.kill()`）、`contextIsolation` 与 `sandbox`、`app.isPackaged` 相关路径（`resourcesPath/bin` 等）在 45 的变更清单里都没有出现。这是读文档的结果，**需要在升级 PR 里用真实运行证实**（见下）。

**打包开关（fuse）：** 45 的变更清单没有提到开关。`wasmTrapHandlers` 这个开关在文档里有（默认开，`@electron/fuses` 2.1.3 已认识，与版本无关），我们的 `RELEASE_FUSES` 没有写它，保持默认。升级后 `package` 任务读出的真实开关要与 `RELEASE_FUSES` 一致（现有断言）。

**macOS 最低版本：** 44 已移除 macOS 12 支持（最低 macOS 13）；45 的变更清单没有再提高。

## 四、安装包依赖集

| 项 | 现状 | 对 45 / 44 补丁的影响 |
| --- | --- | --- |
| node-pty 1.1.0 | 2025-12-22 发布；稳定版里最新（1.2.0 只有 beta）；A、B、C 无公告 | 预编译文件走 N-API（K5 证据），不依赖 Electron 的 ABI 号。45 的 `NODE_MODULE_VERSION` 是 150（44 是 149，来自 `electronjs.org/headers/index.json`），但 N-API 文件不受影响，**预期不用重编译；未在 45 上实测**。升级时重跑 K5 的核对：`require` 成功、开出登录 shell、`spawn-helper` 权限 `755` |
| electron-builder 26.17.0 | 2026-09-26 发布；26 线最新稳定版（27 只有 alpha，不用）；A、B 无公告，C 的 4 条都不影响 | 它按安装的 `electron` 版本打包，配置里没有写死 Electron 版本，**预期可以打 45；未实测**，由升级 PR 的 `package` 任务证实 |
| 其间接依赖 | `pnpm audit`（2026-10-18）报 4 条，与本评估相关的一条：`sprintf-js` ≤1.1.3，中危（GHSA-hp3w-g68c-fv3c），路径 electron-builder → app-builder-lib → @electron/get → global-agent → roarr，**没有修复版本**，只在构建机上运行、不进应用，低于 `audit-gate` 的 high 线；其余是 Monaco 的 dompurify（已在 `dependencies.md` 说明不受影响）和 OpenSpec 的 braces（已有允许清单条目） | 无阻塞；若 electron-builder 以后更新 `roarr` 链，再复查 |
| `http-cache-semantics` 4.3.0 | 2026-10-04 02:56Z 发布，**满 14 天是 2026-10-18 02:56Z**。评估时（UTC 2026-10-17 22:2x）还差约 4.5 小时，本机时间 2026-10-18 06:xx 起已满。是最新版，无更新版本 | 满 14 天后删掉 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里 `http-cache-semantics@4.3.0` 一条（#193 里已记；本 PR 不动） |
| Monaco 0.57.0 | 2026-09-24 发布，最新稳定版；与 Electron 版本无耦合（纯网页代码，在渲染进程里运行，Chromium 152 → 156 只是更新的浏览器） | 无影响；升级后跑编辑器冒烟（`smoke:editor`）和视觉比对 |
| Playwright 1.63.0 | 对 Electron 的支持官方仍标实验性 | 45 beta 上的兼容性**未测**；升级 PR 里跑完整 e2e |
| @electron/fuses 2.1.3 | 109 天；读写开关不依赖 Electron 大版本 | 无影响 |

## 五、升级 45 时要做的事（2026-11-19 之后，单独一个 PR 和 issue）

1. 重新查：45.0.0 的实际发布日（满 30 天）、选一个满 15 天的最新 45.0.x、三处公告（含 Electron 自己的公告页）、45 线停止支持日期是否变动。
2. 按 `add-a-dependency` 改 `pnpm-workspace.yaml` 的 `electron`，在 `dependencies.md` 的 Electron 行写明理由和日期，更新技术设计 §8.1 的版本说明（Chromium、Node 版本以实测的 `process.versions` 为准，K3 方法）。
3. 完整验证：`pnpm verify`、`desktop e2e`、`package` 任务（断言开关、`spawn-helper` 权限、签名）、`smoke`、`smoke:editor`、`smoke:terminal`；预览（`WebContentsView`）的尺寸跟随与截图替换回归（K7 的两项测量复跑一次）；`ui-visual` 的截图比对（Chromium 156 的字体和渲染可能让基线有差异，需要负责人确认基线更新）。
4. 重跑 K5 的 node-pty 核对（见上表）。
5. 手工从干净的临时 `HOME` 和 `--root` 启动打包后的应用，确认没有写到真实的 `~/.runyard`。

## 六、向前看：46 的变化（不属于本次决定，供后续使用）

- **`utilityProcess` 的 `child.kill()` 不再强杀**：现在是 SIGTERM，两秒后补 SIGKILL；46 起只发 SIGTERM，忽略它的子进程不会被终止。我们的 `apps/desktop/src/main/integration/pty-host-process.ts` 调用 `child.kill()`，pty-host 需要自己处理 SIGTERM 并退出，或者主进程自己做“等一会儿再强杀”。可以在 44/45 上提前做，不依赖升级。
- `safeStorage` 同步方法在 46 移除（我们不用）；`capturePage` 的图片改带页面缩放比（预览截图替换用到，K7 复测）。

## 没有验证的

- 没有在 Electron 45 上运行任何东西：45 还是 beta（beta.5），本文对 45 的判断来自文档，需要升级 PR 用真实打包验证。
- 45.0.0 的稳定日期来自 Chromium 时间表（2026-10-20），Electron 时间表里这一格还空着，可能变动。
- 没有读各 44.x 发布说明里的每个 Chromium 小版本对应的 CVE 清单。
