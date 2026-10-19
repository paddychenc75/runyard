# 依赖决定记录

每个直接依赖一行，规则见技术设计 §8.6。`pnpm check` 里的 `deps-record` 核对：直接依赖都有行、版本与 `package.json` 一致、“公告查询”不为空。
“公告查询”的三个来源：A = OSV.dev；B = GitHub 公告库；C = 项目自己仓库的安全公告页。“无”表示三处在查询日都没有影响该版本的公告。
括号里是发布日到 2026-10-12 的天数。后面尚未装进仓库的行（Electron 等）随各自的包一起落地时再复核。

Electron 首版范围于 2026-10-19 调整（#387），仅复核官方支持日程，不更新下表原安全查询日期或结论。当前仍锁 44.5.1；#383 的 44.7.2 补丁计划和 15 天挑选线保留，本次未安装或批准年龄例外。

| 包 | 选定版本 | 发布日期 | 查询日期 | 公告查询 | 为什么是这个版本 |
| --- | --- | --- | --- | --- | --- |
| node | 24.21.0 | 2026-09-07（35 天） | 2026-10-12 | 无（Node 官方安全公告页最近一期早于本版本；OSV 不收录 Node 本体） | 24 线 LTS，2028-04-30 结束支持；26 线满 90 天后再考虑 |
| pnpm | 11.28.0 | 2026-09-25（17 天） | 2026-10-12 | 无（A、B、C） | 12 线不满 90 天，取 11 线满 15 天的最新补丁；本机 10.30.1 有高危公告，必须升级 |
| turbo | 2.11.4 | 2026-09-24（18 天） | 2026-10-12 | 无（A、B；C 的三条已在 2.9.14 修复） | 2.11.7 才发布 10 天，取满 15 天的最新版 |
| typescript | 6.0.3 | 2026-04-16（179 天） | 2026-10-12 | 无（A、B；TypeScript 没有公告页，C 不适用） | 6.0 线最新补丁；7 线按负责人决定先不用。`apps/desktop` 也声明它（#411）：构建时从中拷出 `typescript.js`、`tsserver.js` 等放进 Vue 语言服务目录，Vue 服务器和 tsserver 用同一份，用户项目自己的 TypeScript 不用 |
| @biomejs/biome | 2.5.14 | 2026-09-16（26 天） | 2026-10-12 | 无（A、B、C） | 2.5.15 才发布 12 天；检查与格式化一份配置 |
| vitest | 4.1.11 | 2026-08-18（55 天） | 2026-10-12 | 无（A、B）；C 的 Browser Mode 和 UI 服务公告不涉及我们用的功能，路径穿越 GHSA-82fw-gwwq-j7x9 正是 4.1.11 修复的 | 5 线大版本不满 90 天，退回 4 线最新版；2026-12-02 之后可升 5 |
| zod | 4.6.5 | 2026-09-13（29 天） | 2026-10-12 | 无（A、B、C） | 4.6.6 才发布 1 天；protocol 包的数据校验库；tooling 的 `generate` 也用它把登记表转成参考文档（同一个版本，不另装） |
| @types/node | 24.19.0 | 2026-09-25（17 天） | 2026-10-12 | 无（A、B；C 的 DefinitelyTyped 公告页为 0 条） | 设计表未列：与 Node 24 线对应，24.19.1 发布 11 天不满 14 天，取 24.19.0；脚本和 Node 环境的包需要它的类型 |
| yaml | 2.9.1 | 2026-09-11（31 天） | 2026-10-12 | 无（A、B）；C 有 GHSA-48c2-rrv3-qjmp（中，深层嵌套抛 RangeError），2.8.3 起修复，本版本不受影响 | 设计表未列：tooling 检查脚本读 pnpm-workspace.yaml 用，零依赖、持续维护，取满 15 天的最新版 |
| @playwright/test | 1.63.0 | 2026-09-04（42 天） | 2026-10-16 | 无（A：OSV 与 deps:lookup 的 A 列；B：GitHub 公告库 0 条；C：microsoft/playwright 的安全公告页 0 条，1.63.0 发布说明无安全字样） | 1.64.0 发布 9 天、1.64.1 发布 2 天，都不满 15 天；1.x 不是新大版本。截图比对只用它的测试运行器和 `toHaveScreenshot`（不用 `experimental-ct-react`），只在 `packages/ui`（devDependency）。它没有安装脚本；浏览器不在安装时下载，由 `playwright install chromium` 从 Playwright 的下载站取（版本由 Playwright 版本钉死，Chromium 153，技术设计 §6.7），CI 的 `ui-visual` 和 `ui-baseline` 每次运行时下载。对 Electron 的支持官方仍标实验性（端到端测试用，随后续 issue） |
| electron | 44.5.1 | 2026-09-30（16 天） | 2026-10-16 | A 无；B、C 无影响 44.5.1 的公告：44.4.5 受 GHSA-x562-297c-g43g（中，pointerLock 权限请求来源错帧，2026-10-15 公布）影响，44.5.0 起修复；其余 44 线公告均在 44.4.3 及以前修复 | 设计表原定 44.4.5，被上面的新公告否决；取 44 线满 15 天的最新补丁（44.6.0 及以后不满 15 天）；44 线支持到 2027-03-02；负责人 2026-10-19 允许第一版继续用合格的 44.x 补丁；发版时至少剩 3 个月支持期（按当前日程须在 2026-12-02 前，届时复核）；45 移到后续独立升级，见 electron-version 证据的当前决定；二进制不在安装时下载，第一次运行 `pnpm dev` 时才下载（约 100 MB） |
| esbuild | 0.28.2 | 2026-08-08（69 天） | 2026-10-16 | 无（A）；B、C：0.28.0 及以前有 GHSA-gv7w-rqvm-qjhr（高）、GHSA-g7r4-m6w7-qqqr（低），0.28.1 起修复，本版本不受影响 | 设计表未列：`apps/desktop` 在 electron-vite 可用之前用它打包主进程、预加载脚本和界面（已在 `allowBuilds` 里放行）；0.28 线最新补丁，Vite 8 的可选 peer 也接受 ^0.28.0 |
| electron-vite | 5.0.0 | 2025-12-07（309 天） | 2026-10-12 | 无（A、B、C） | peer 依赖只到 Vite 7，6.0 仍是测试版。**尚未装**：它要 Vite 7，而可用的 7.3.7 发布不满 14 天，装它要放宽安装的年龄限制（需负责人同意）；2026-10-20 起满 14 天，届时不需要放宽。在此之前 `apps/desktop` 用下面的 esbuild 自己打包 |
| vite | 7.3.7 | 2026-10-06（6 天） | 2026-10-12 | 7.3.6 及以前有 GHSA-rq7h-c2jc-7f22、GHSA-vfpm-58rq-9qcg、GHSA-9jrq-w75r-8gcw，7.3.7 修复；只在 C | 安全修复例外（规则 3），**尚未装、也没有加例外**（2026-10-16 时它只发布 10 天）；2026-10-20 满 14 天后随 electron-vite 一起装，届时不需要例外条目。`packages/ui` 的工作台因此用已有的 esbuild 打包，不等 Vite（技术设计 §6.7 写的是 Vite 页面，换成 Vite 只改 `workbench/build.ts`） |
| electron-builder | 26.17.0 | 2026-09-26（16 天） | 2026-10-17 | 无（A、B）；C 的 4 条（builder-util-runtime 9.7.0、app-builder-lib 26.15.0、electron-updater、NSIS 24.13.2 起修复）都不影响本版本 | 固定 26.x，升大版本前先读迁移说明；`apps/desktop` 的 devDependency（#193）；`electron-winstaller` 的安装脚本在 `allowBuilds` 里写 `false`（只给 Windows 用，决策记录 0007） |
| @electron/fuses | 2.1.3 | 2026-06-29（109 天） | 2026-10-17 | 无（A、B）；C（electron/fuses）公告页 0 条 | `apps/desktop` 的 devDependency：`package` 任务读打好的可执行文件里的真实开关并断言；electron-builder 自己带的是 1.8.0，写开关用它的，这里只读 |
| http-cache-semantics（electron-builder 的间接依赖） | 4.3.0 | 2026-10-04（13 天） | 2026-10-17 | 4.2.0 有 GHSA-ch52-4w7c-c8xp（高）；4.3.0 修复 | **安全修复例外（规则 3）**：已满 72 小时；负责人 2026-10-17 批准（“这个可以不用限制这么久”），曾在 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 里加了 `http-cache-semantics@4.3.0`，锁文件里只有 4.3.0。**例外已于 2026-10-18 结束**：该版本满 14 天，条目已删（#240），现在按正常年龄规则解析；没有加 `security/allowlist.toml` 条目 |
| node-pty | 1.1.0 | 2025-12-22（298 天） | 2026-10-17 | 无（A、B、C）：OSV 与 `deps:lookup` 的 A 列无；GitHub 公告库 0 条；C（microsoft/node-pty）公告页 0 条，当前只有 1.2.0 测试版，稳定版最新就是 1.1.0 | 只在 `apps/desktop`（终端 pty-host，#263）。K5 已验证：预编译文件在打包后的 Electron 44 里直接加载（`docs/architecture/evidence/k5-node-pty.md`）。`allowBuilds` 写 `node-pty: false`（预编译文件随包，install 脚本在 macOS 上一行都不用跑；负责人 2026-10-17 批准）；唯一的间接依赖 `node-addon-api` 只在从源码编译时用。包里 `spawn-helper` 是 0644：打包时 `chmod 755` 并断言，开发时 pty-host 启动自检补权限 |
| chokidar | 5.0.0 | 2025-11-25（321 天） | 2026-10-12 | 无（A、B、C） | 文件监听，纯 JS，只在 `packages/platform`（`watch`，#28）；唯一的间接依赖 readdirp 5.1.1（2026-08-06，67 天）由 pnpm 年龄规则把关，同样纯 JS |
| monaco-editor | 0.57.0 | 2026-09-24（23 天） | 2026-10-17 | A、B、C 无针对本包的公告（C：microsoft/monaco-editor 公告页 0 条）。**间接依赖 dompurify 3.4.15（包里 `dependencies` 写死，还有一份打包在 `esm/vs/base/browser/dompurify/`）有 5 条低危公告**：GHSA-6688-9rhm-gjv2、GHSA-p98j-92pf-mc4p（3.4.16 修复；A、C 都有，`pnpm audit` 报这两条）、GHSA-c6gr-qvv4-5v3f、GHSA-mrv2-3pqr-j5jr、GHSA-cg2g-xh64-v4q7（3.4.17 修复，只在 C，2026-10-12 公布）。**不受影响**：五条都只出现在 `IN_PLACE`、`SAFE_FOR_TEMPLATES` 或 XHTML 解析模式；Monaco 0.57.0 只在 `esm/vs/base/browser/domSanitize.js` 里调用它，用 `RETURN_DOM_FRAGMENT` 加三个钩子（`uponSanitizeElement`、`uponSanitizeAttribute`、`afterSanitizeAttributes`），没有用这三种模式，处理的也只是编辑器内部的悬浮提示文字，不是不可信页面。审计闸门只拦高危和严重，低危不卡，**没有加允许清单条目，也没有年龄例外**；Monaco 出了带 DOMPurify 3.4.17 的版本就升级 | 编辑器内核（#256）。0.56.0 更旧，负责人 2026-10-17 对 PR #245 问题 11 选 0.57.0（x.0.0 的 90 天规则按字面不管 0.x）；按需引入、不用 `@monaco-editor/loader`（它从 CDN 下载）；后台线程和字体由 `app://runyard/` 提供，策略见决策记录 0020 |
| @vue/language-server | 3.3.12 | 2026-10-02（16 天） | 2026-10-18 | 无（A：OSV 对它与全部间接依赖共 81 个包的批量查询 0 条；B 无；C：vuejs/language-tools、volarjs/volar.js 的公告页都是 0 条，3.3.12 发布说明有一条“improved handling of untrusted Vue files”，是加固而非公告） | 决策记录 0021：Vue 单文件组件的智能提示，作为独立进程运行（进程管理见 #412），构建时用 esbuild 打成单文件放进 `Resources`；3.3.13 才发布 7 天，不取；3 线早已超过 90 天。许可 MIT；间接依赖许可：MIT 为主，ISC 1 个（`@emmetio/html-matcher`）、BSD-2-Clause 1 个（`entities`）；没有新增安装脚本。`@vue/compiler-core`、`@vue/compiler-dom`、`@vue/shared` 由 pnpm 的年龄设置自动锁到 3.5.43（2026-09-17，3.5.44 才 4 天），不需要例外 |
| @vue/typescript-plugin | 3.3.12 | 2026-10-02（16 天） | 2026-10-18 | 同 @vue/language-server（同一仓库、同一次发布、同一批查询） | 决策记录 0021：装进 tsserver 的 Vue 插件（“混合模式”），**不能打成单文件**（证据“踩到的坑”第 6 条），构建时连同依赖原样复制进语言服务目录；与 @vue/language-server 必须同版本。许可 MIT |
| vue | 3.5.43 | 2026-09-17（31 天） | 2026-10-18 | 无（A：OSV 对 vue 及 runtime-core、runtime-dom、reactivity、compiler-sfc 等间接依赖 0 条；B 无；C：vuejs/core 已在 vue3 模板一行查过，3.5.41 及以前的 @vue/server-renderer 有 GHSA-g2v6-rqmx-r4w6，本版本不受影响） | **只在 `tooling`，不进成品**：冒烟脚本（`tooling/scripts/vue-language-service-smoke.ts`）要给测试项目一份真实的 vue 类型，Vue 语言服务读的是项目自己的 `node_modules/vue`；手写替身试过，defineProps 的类型流不到模板（属性补全为空）。与 vue3 模板同版本；3.5.44 才发布 5 天，不取 |
| @shikijs/monaco | 4.4.3 | 2026-08-10（68 天） | 2026-10-17 | 无（A、B）；C（shikijs/shiki）公告页 0 条，4.5.0 与 4.4.3 发布说明无安全字样 | 4.5.0 今天刚满 15 天、刚够线，按“不取最新”取 4.4 线最新补丁；和 shiki 同版本；把 Shiki 的着色接到 Monaco（Monaco 自带着色器不认识 Vue）；只在 `apps/desktop` |
| shiki | 4.4.3 | 2026-08-10（68 天） | 2026-10-17 | 无（A、B）；C（shikijs/shiki）公告页 0 条，4.5.0 与 4.4.3 发布说明无安全字样 | 同上，4.0 大版本已满 90 天；用 JavaScript 正则引擎（`shiki/engine/javascript`）而不是 WASM，所以策略不需要 `wasm-unsafe-eval`；语法和主题从 `shiki/langs/*`、`shiki/themes/*` 单个引入；只在 `apps/desktop` |
| @xterm/xterm | 6.0.0 | 2025-12-22（298 天） | 2026-10-17 | 无（A、B、C）：OSV、GitHub 公告库 0 条；C（xtermjs/xterm.js）公告页 0 条，6.0.0 是最新稳定版 | 终端界面（#263 的界面部分；本 PR 只装不用）；6.0 已满 90 天 |
| @xterm/addon-fit | 0.11.0 | 2025-12-22（298 天） | 2026-10-17 | 无（A、B、C；C 与 xterm 同一个公告页，0 条） | 终端随容器调整行列数；与 xterm 6.0.0 配套 |
| @xterm/addon-search | 0.16.0 | 2025-12-22（298 天） | 2026-10-17 | 无（A、B、C；同上） | 终端里查找（规格 DESKTOP-TERMINAL-23）；与 xterm 6.0.0 配套 |
| @xterm/addon-web-links | 0.12.0 | 2025-12-22（298 天） | 2026-10-17 | 无（A、B、C；同上） | 终端里的网址 ⌘ 加点击（规格 DESKTOP-TERMINAL-19）；与 xterm 6.0.0 配套 |
| tsdown | 0.23.0 | 2026-09-03（39 天） | 2026-10-12 | 无（A、B、C） | 0.23.1 才发布 2 天；把命令行打成单文件 |
| googleapis/release-please-action | v5.0.0 | 2026-04-22（173 天） | 2026-10-12 | 无（B；该 Action 自己仓库的公告页和 OSV 也已查，2026-10-12 均无） | 当前最新，运行时 node24，仍在维护（最近提交 2026-08-28）；固定到提交哈希 45996ed1f6d02564a971a2fa1b5860e934307cf7；它打包的 release-please 库是 17.6.0（OSV、GitHub 公告库、项目公告页均无公告，2026-10-12） |
| release-please（命令行，只在临时目录里本地试运行） | 17.6.0 | 2026-04-13（182 天；间接依赖由 pnpm 的年龄规则把关） | 2026-10-12 | 无（A、B、C） | 与 Action 打包的是同一版本，用来在合并前预览更新日志；不加进工作区。K15 量过 17.11.2（决策记录 0011），Action 现在打包的是 17.6.0，以 Action 为准 |
| astro | 7.3.5 | 2026-09-24（18 天） | 2026-10-12 | A、B 无；C 的公告在 7.2.8 及以前已修复 | 7.3.8 才发布 4 天 |
| @astrojs/starlight | 0.42.4 | 2026-09-24（18 天） | 2026-10-12 | 无（A、B、C） | peer 依赖 Astro ^7.2.10，与 7.3.5 相符 |
| react | 19.3.0 | 2026-09-09（33 天） | 2026-10-12 | A、B 无；C 里的公告只涉及服务端组件，应用界面不用 | react 与 react-dom 同版本；2026-10-16 复查：19.3.1（2026-10-14）才发布 2 天不取；同日公布的 GHSA-xqc2-xf4c-x3h3、GHSA-h3gv-c5rc-p453 只涉及 react-server-dom-*，不影响 react；先给 `@runyard/i18n` 的 React 绑定用（#164），`apps/desktop` 的界面也用（#168，同一版本） |
| react-dom | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B）；C（facebook/react）2026-10-14 的两条公告只涉及 react-server-dom-*，不影响 react-dom | 与 react 同版本；`@runyard/i18n` 只在测试里用它的 `renderToString` 渲染 React 绑定（devDependency） |
| @types/react | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B；C 的 DefinitelyTyped 公告页 0 条） | 与 react 19.3.0 同版本；`@runyard/i18n/react` 的类型 |
| @types/react-dom | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B；C 的 DefinitelyTyped 公告页 0 条） | 与 react-dom 19.3.0 同版本；测试里用 |
| @base-ui/react | 1.8.0 | 2026-09-04（42 天） | 2026-10-16 | 无（A、B）；C（mui/base-ui）公告页 0 条，1.8.0 和 1.9.0 的发布说明里没有安全字样 | 技术设计 §8.6 要求首次安装时重选版本；1.9.0 才发布 7 天，取 1.8.0；1.0 早已发布（大版本满 90 天）；peer 依赖 react ^17 \|\| ^18 \|\| ^19，与 19.3.0 相符；行为和无障碍库，只用于 `packages/ui` |
| jsdom | 29.1.1 | 2026-04-30（169 天） | 2026-10-16 | 无（A、B）；C（jsdom/jsdom）公告页 0 条 | 组件测试需要 DOM；30.0.0 发布 81 天不满 90 天，退回 29 线的最新版（29.1.1，Node ^20.19 \|\| ^22.13 \|\| >=24）；只在 `packages/ui` 和 `apps/desktop`（界面的组件测试）的测试里用 |
| @testing-library/react | 16.3.3 | 2026-08-27（50 天） | 2026-10-16 | 无（A、B）；C 公告页 0 条 | 渲染组件、按角色找元素；peer 依赖 react 18 或 19、@testing-library/dom ^10；只在测试里用 |
| @testing-library/dom | 10.4.2 | 2026-09-13（33 天） | 2026-10-16 | 无（A、B）；C 公告页 0 条 | @testing-library/react 的 peer 依赖，取 10 线满 15 天的最新版；只在测试里用 |
| @testing-library/user-event | 14.6.7 | 2026-09-02（44 天） | 2026-10-16 | 无（A、B）；C 公告页 0 条 | 模拟真实的键盘和鼠标操作（测键盘可达）；14.6.8 才发布 3 天，不取；只在测试里用 |
| renovate | 托管版 | — | 2026-10-12 | 最新 44.150.1；自托管必须不低于 44.79.0 | 用 Mend 托管的应用，不在仓库里装 |
| google/osv-scanner-action | v2.6.0 | 2026-09-14（28 天） | 2026-10-12 | 无（B） | 固定到提交哈希 a345acffa64b0eaede81a3d9aae6141214d9c8fc |
| actions/dependency-review-action | v5.0.0 | 2026-05-08（157 天） | 2026-10-12 | 无（B） | 固定到提交哈希 a1d282b36b6f3519aa1f3fc636f609c47dddb294 |
| actions/checkout | v7.0.1 | 2026-07-20（84 天） | 2026-10-12 | 无（B；该 Action 自己仓库的公告页和 OSV 也已查，2026-10-12 均无） | 最新发布且满 14 天，所在大版本仍在维护；固定到提交哈希 3d3c42e5aac5ba805825da76410c181273ba90b1 |
| actions/setup-node | v7.0.0 | 2026-07-14（90 天） | 2026-10-12 | 无（B；该 Action 自己仓库的公告页和 OSV 也已查，2026-10-12 均无） | 最新发布且满 14 天，所在大版本仍在维护；固定到提交哈希 820762786026740c76f36085b0efc47a31fe5020 |
| pnpm/action-setup | v6.1.0 | 2026-09-05（37 天） | 2026-10-12 | 无（B；该 Action 自己仓库的公告页和 OSV 也已查，2026-10-12 均无） | 最新发布且满 14 天，所在大版本仍在维护；固定到提交哈希 ea17c68df8912ef543352723c149a84f56e3d413 |
| intl-messageformat | 11.2.15 | 2026-09-12（30 天） | 2026-10-12 | 无（A、B、C）；C 的安全公告页 0 条，发布说明无安全字样 | 12.0.0 才发布 27 天，不满新大版本 90 天，取 11 线最新补丁；ICU 文案的运行时格式化，只在 `packages/i18n`，外面包一层薄封装 |
| @formatjs/icu-messageformat-parser | 3.5.18 | 2026-09-12（30 天） | 2026-10-12 | 无（A、B、C） | 与 intl-messageformat 11.2.15 声明的依赖版本一致，锁文件里只有一份；`packages/i18n` 的生成脚本读中文文案推出参数类型 |
| @fission-ai/openspec | 1.14.0 | 2026-09-30（16 天） | 2026-10-16 | A、B 无；C 无公告、1.14.0 与 1.14.1 发布说明无安全字样。间接依赖 braces 3.0.3 有 GHSA-vfj7-8cjw-p6xm（高危，B 无修复版本），负责人批准例外 A（技术设计 §9.6.3），登记在 `security/allowlist.toml`，复核日 2026-12-15 | 规格驱动开发工具，只在开发机和 CI 运行，根目录开发依赖；70 个依赖都没有安装脚本（不需要 `allowBuilds`）；1.14.1 未实测、1.14.2 才发布 1 天，取实测过的 1.14.0；匿名统计和版本检查由 `pnpm spec` 包装脚本关闭（决策记录 0016） |
| react、react-dom（react19 模板） | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B、C）；C 的公告都是 react-server-dom-*（服务端组件），模板不用 | 模板依赖（技术设计 §8.6.5）；与应用界面同版本；react-dom 的 peer 依赖要求同版本 react |
| react、react-dom（react18 模板） | 18.3.1 | 2024-04-26（903 天） | 2026-10-16 | 无（A、B、C）；C 只有 19 线的服务端组件公告 | 18 线最后一个版本，上游不再更新；规则 8：保留，模板说明里写“React 18 已不再更新” |
| vite（react19、react18、vue3 模板） | 8.3.3 | 2026-10-06（10 天） | 2026-10-16 | 8.3.2 及以前有 GHSA-rq7h-c2jc-7f22、GHSA-vfpm-58rq-9qcg、GHSA-9jrq-w75r-8gcw，8.3.3 修复；A、B 无，只在 C | 安全修复例外（规则 3）：不满 14 天也取；生成模板锁文件时临时加 `minimumReleaseAgeExclude=vite@8.3.3`，只在命令行，不进模板；8 线 2026-03-12 发布，满足规则 4。要求 Node ^20.19 或 >=22.12，模板的 Node 下限因此是 22.13（pnpm 10.34.6 自己要求 >=22.13，#144） |
| @vitejs/plugin-react（react19、react18 模板） | 6.1.1 | 2026-08-28（49 天） | 2026-10-16 | 无（A、B）；C（vitejs/vite-plugin-react）只有 0.5.x 及以前的旧公告 | 6.1.2 发布 7 天时不取；peer 依赖 vite ^8 |
| @types/react（react19 模板） | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B） | 与 react 19.3.0 同版本 |
| @types/react-dom（react19 模板） | 19.3.0 | 2026-09-09（37 天） | 2026-10-16 | 无（A、B） | 与 react-dom 19.3.0 同版本 |
| @types/react（react18 模板） | 18.3.31 | 2026-06-05（133 天） | 2026-10-16 | 无（A、B） | 18 线满 14 天的最新版 |
| @types/react-dom（react18 模板） | 18.3.7 | 2025-04-30（534 天） | 2026-10-16 | 无（A、B） | 18 线满 14 天的最新版 |
| typescript（三个 Vite 模板、hono 模板） | 6.0.3 | 2026-04-16（183 天） | 2026-10-16 | 无（A、B） | 与仓库用的版本相同；模板里只用来 `tsc --noEmit` 类型检查 |
| vue（vue3 模板） | 3.5.43 | 2026-09-17（29 天） | 2026-10-16 | 3.5.41 及以前的 @vue/server-renderer 有 GHSA-g2v6-rqmx-r4w6（高危，只在 C），本版本不受影响；A、B 无 | 满足规则 2，且不能退回 3.5.41 |
| @vitejs/plugin-vue（vue3 模板） | 6.0.9 | 2026-09-14（32 天） | 2026-10-16 | 无（A、B）；C 的公告页 0 条 | 6.0.10 发布 2 天时不取；peer 依赖 vite 含 ^8 |
| hono（hono 模板） | 4.13.11 | 2026-09-29（17 天） | 2026-10-16 | 4.13.11 以前有 GHSA-5r4p-p66f-jhc7（中，serveStatic 二次解码），本版本修复；C 里其余公告的修复版本都不高于 4.13.11；A、B 无 | 技术设计 §8.6.5 和规格 TEMPLATES-FORMAT-52 定的版本。原先靠安全修复例外选它（当时 4.13.12 才 12 天），现在发布已满 14 天，不再需要例外条目；4.13.12、4.13.13 现在也合格，但版本固定在规格里，要升须先改规格 |
| @hono/node-server（hono 模板） | 2.1.3 | 2026-09-29（17 天） | 2026-10-16 | 2.1.2 及以前有 GHSA-rmxm-3fg6-px4f（中，同一个二次解码问题），本版本修复；C 里其余公告的修复版本都低于 2.1.3；A、B 无 | 同上：版本来自技术设计 §8.6.5，发布已满 14 天，不需要例外条目；peer 依赖 hono ^4 |
| @types/node（hono 模板） | 24.19.0 | 2026-09-25（21 天） | 2026-10-16 | 无（A、B）；唯一的间接依赖 undici-types 7.24.6 也无 | 与仓库用的版本相同；模板里只用来给 `tsc --noEmit` 提供 Node 的类型 |
| simple-icons（只拷三个字形，不安装） | 16.33.0 | 2026-09-27（20 天） | 2026-10-17 | 无（A：OSV 0 条；B：只有 2024 年的 Actions 工作流公告 GHSA-xp96-pghg-87vx，针对仓库 CI 而非包，11.11.0 已修复；C 同 B） | 许可 CC0-1.0。**不是运行时依赖**：把 html5、vuedotjs、python 三个 SVG 拷到 `packages/ui/src/icons/svg/`；16.35.0（6 天）、16.34.0（13 天）不满 14 天；16 线不是新大版本。各品牌的使用规范和不使用的原因见根目录 `THIRD_PARTY_NOTICES.md` |
