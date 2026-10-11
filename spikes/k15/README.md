# K15：工具链几处不确定的逐项核对

技术设计 §11.1 的 K15 一行列了一长串“用记忆写的、没验证过”的工具链细节，附录 B 里也有若干条指向 K15。这次不是新实验，而是一次**审计**：把每一项拆开，判定它是 (a) 仓库里已经证明了、(b) 这次做最小实验证明了、(c) 对象还不存在要等后面的里程碑、(d) 不成立或要改设计。已经证明的不重做。

## 怎么复现

本机（macOS，Node 24）一条命令跑完本机能做的全部实验，本机结果写进 `results/`，CI 机器上拿到的 JSON 存在 `results-ci/`（截图的 PNG 在对应运行的产物里，保留 14 天）：

```sh
cd spikes/k15 && pnpm run all
```

需要 CI 机器的部分（macos-26 的字体和截图、Playwright 对 Electron、Windows 与 Linux 上的小实验、OSV 官方 Action、Go 自动下载工具链）在 `.github/workflows/spike-k15.yml` 里，推送到 `spike/k15-*` 分支或手动触发即可。各实验也可以单独跑：`node pnpm/run.mjs`、`node node-ts/run.mjs`、`node biome/run.mjs`、`node release-please/run.mjs`、`node osv/run.mjs`（需要 `gh`）、`node audit/run.mjs`、`node small/run.mjs`、`node small/vite-hmr.mjs`。所有实验都在临时目录里装依赖、跑完删除，不改仓库的任何配置，也不碰 `~/Runyard`、`~/.runyard`。

## 环境

| 环境 | 内容 |
| --- | --- |
| 本机 | macOS 27.0.1（arm64，Apple M3 Max），Node 24.21.0，pnpm 11.28.0，Python 3.14.3 |
| macos-26 | 镜像 `macos26 20260907.0351.1`，macOS 26.6.2（arm64），Node 24.21.0 |
| ubuntu-latest | Ubuntu 24.04.5，镜像 `20261004.327.1`，Node 24.21.0，Go 1.24.13（镜像自带） |
| windows-2025 | GitHub 托管的 Windows Server（管理员账号，Defender 按 CI 配置），Node 24.21.0 |
| 工具版本 | Biome 2.5.14、release-please 17.11.2、OSV-Scanner 2.6.0、Playwright 1.63.0、Electron 44.4.5、Vite 7.3.6（只用来测热更新连接）、zod 4.6.5 |

GitHub 托管的 Windows 是 Windows Server，不是负责人的 Windows 11：下面所有 Windows 结论只是近似。

## 核对表

判定：**已证实·出处** = 仓库里已有证据，没有重做；**本次验证** = 这次做了最小实验；**待里程碑 Mx** = 对象还不存在；**不成立** = 与技术设计的写法不符，需要改。“重复”指同一实验独立跑了几次。

### 一、K15 一行里的逐项

| # | 条目 | 判定 | 证据 | 对设计的影响 |
| --- | --- | --- | --- | --- |
| 1 | Biome 按目录配置禁用导入 | **本次验证**，成立，有一处陷阱 | `biome/fixture` 里用 `overrides[].includes` 分目录配置：`packages/core` 导入 `electron` 被 `noRestrictedImports` 拦，`packages/protocol` 导入 `node:fs` 被 `noNodejsModules` 拦，`apps/desktop/src/main` 里不拦；测试文件用 `!**/*.test.tsx` 排除有效；macOS、Ubuntu、Windows 三个系统结果一致（CI 运行 38183626171）。仓库自己的 `biome.json` 已经这样用，且 `pnpm lint` 三系统全绿。**陷阱**：同一条规则被两个 override 同时命中时，后一个的 `options` 整体替换前一个（不合并）：`packages/**` 禁 `electron`、`packages/ui/src/base/**` 再加 `patterns` 之后，基础组件目录里的 `electron` 导入漏掉了（`biome/fixture/packages/ui/src/base/b.ts` 第 2 行，结果里标为“已知缺口”） | §3.3 表里“按目录分别配置的写法【未核实】”改为已核实，并加一句：同一条规则在多个 override 里命中同一文件时，更具体的那条要把 `paths` 和 `patterns` 全部重写，不合并。`ui-layers` 以脚本为准的决定不变 |
| 2 | Node 24 直接运行另一个包的 `.ts` 源码 | **本次验证**，成立，对写法有约束 | `node-ts/run.mjs`：pnpm 工作区链接的包，`"exports": "./src/index.ts"`，用 `node b.ts` 导入。能跑：函数与常量导入、`import type`、`import { type X }`、`.ts` 扩展名的相对导入、`as`/`satisfies`/泛型。**报错**：不写 `type` 导入只有类型的名字（运行时 `SyntaxError: does not provide an export`）；`enum`、`namespace`、参数属性（`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`，加 `--experimental-transform-types` 才行且有实验警告）；相对导入不写 `.ts`（`ERR_MODULE_NOT_FOUND`）；tsconfig `paths` 别名（Node 不认）；包被真正装进 `node_modules`（复制而不是链接）时拒绝剥离（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）；包没有 `"type": "module"` 能跑但每次打警告。3 个系统结果一致（macOS 本机 + 三台 CI） | 仓库的 `tsconfig` 已有 `erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions`，正好对应上面的约束，不用改。要写进 `packages/*/AGENTS.md` 的一句话：包内一律写 `.ts` 扩展名、只用可擦除语法、类型用 `import type`、不用 tsconfig `paths`；包只能以工作区链接（`workspace:*`）被引用，不能先打包再装。§8.2“内部包直接用源码互相引用”成立 |
| 3 | pnpm 11 `allowBuilds` 写法 | **本次验证** + 已证实（仓库在用） | 用 esbuild 0.25.12（有 postinstall）测 5 种配置：不写 → `ERR_PNPM_IGNORED_BUILDS`，退出码 1；`allowBuilds: {esbuild: true}` → 脚本运行，退出码 0；`{esbuild: false}` → 不运行、退出码 0；旧写法 `onlyBuiltDependencies` → **不再生效**（等于没写，退出码 1）；`strictDepBuilds: false` → 只警告、退出码 0。仓库的 `pnpm-workspace.yaml` 写法与此一致，CI 三系统 `pnpm install --frozen-lockfile` 全绿。另见 K1 README：`electron@44.4.5` 没有安装脚本，`allowBuilds` 里的 `electron` 对它不起作用 | 无。可在 `docs/guides` 的“添加依赖”手册里加一句：pnpm 11 不认 `onlyBuiltDependencies` |
| 4 | `minimumReleaseAge` 对已有锁文件的重新校验 | **本次验证**，会重新校验 | 先用 `minimumReleaseAge: 0` 把 `zod@4.6.6`（发布不满 14 天）写进锁文件，再改成 20160：`pnpm install --frozen-lockfile`、`pnpm install`、`pnpm install --lockfile-only --force` 三种都以 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 失败（“1 lockfile entries failed verification”），退出码 1。没有锁文件时全新解析同一版本报 `ERR_PNPM_NO_MATURE_MATCHING_VERSION`；`pnpm add zod`（范围）自动取满 14 天的 4.6.5。例外条目写 `zod@4.6.6`（包名@版本）或裸包名 `zod` 都放行 | 技术设计 §8.6.4 第 7 步要明确写：锁文件里出现不满 14 天的版本而没有对应例外条目，CI 的 `pnpm install --frozen-lockfile` 会直接失败，所以例外条目必须和锁文件在同一个 PR 里。这也是 Renovate 安全 PR 冲突的 pnpm 一侧（见下面 B6） |
| 5 | `minimumReleaseAgeExcludePrune` 做什么 | **不成立**（与技术设计的理解不符） | 设计和 `pnpm-workspace.yaml` 注释都写“例外条目满 14 天后自动清除”。实测：条目 `zod@4.6.5`（已满 29 天、锁文件仍在用）**保留**；`zod@4.6.6`（不满 14 天、锁文件不再用）、`left-pad@1.3.0`、`ms`、不存在的包都被**清掉**；`zod@4.6.6` 在用且不满 14 天时保留，升级到 4.6.5 之后才被清掉。`install` 和 `add` 都会清（pnpm 自己的变更说明只写了 add/update/remove，文档页写 install 也会）。**结论：它清掉的是“锁文件已经不再解析到的版本”，与年龄无关** | §8.1 Vite 一行“2026-10-20 满 14 天后自动清掉”、`pnpm-workspace.yaml` 里“例外条目满 14 天后自动清除”的注释都要改：条目会一直留到依赖升级、锁文件不再用那个版本为止；满 14 天后要手动删（或在升级时自然被清）。`deps-policy` 可以加一条：条目对应版本已满 14 天时提示删除 |
| 6 | `packageManager` 自动切换（10.30.1 → 11.28.0） | **已证实**·§8.6.6 | 技术设计 §8.6.6 记录了 2026-10-12 在隔离目录里的实测；仓库的 CI 全部用 `pnpm/action-setup` 从 `packageManager` 读版本并通过；本机 `pnpm -v` 为 11.28.0。这次没有重做（不装旧版本） | 无 |
| 7 | `trustPolicy: no-downgrade` 会不会误伤 | **本次验证**，会误伤，**不要原样启用** | 仓库当前的依赖树（90 个包）：开启后冻结安装和全新解析都通过，退出码 0。但对技术设计 §8.1 里 Electron + Vite + React + Astro 等 20 个直接依赖的真实树（约 900 个包）：开启后 `ERR_PNPM_TRUST_DOWNGRADE`，先后拦下 `semver@6.3.1`（经 `@babel/core`）和 `@octokit/endpoint@9.0.6`（经 `release-please`），两个都是正常的旧版本补丁（此前更新的版本有来源证明、它们没有）；逐个写 `trustPolicyExclude` 要 2 条才能装完。改用 `trustPolicyIgnoreAfter`（只检查最近发布的版本，单位分钟）：20160、129600、525600 三档都装得上。注意它和年龄规则的关系：版本都已满 14 天才会被装，所以 `trustPolicyIgnoreAfter` 不能 ≤ 20160，否则等于什么都不检查 | 建议：现在不开。将来要开，同时设 `trustPolicyIgnoreAfter: 129600`（90 天，检查“满 14 天但不满 90 天”这段窗口里的版本）并在 Nuxt、Next 模板的树上再试一次。§8.6.3 表里“是否会误伤正常包没试过”改为“会（semver@6.3.1 等），要配 `trustPolicyIgnoreAfter` 或逐个 `trustPolicyExclude`” |
| 8 | `osv-scanner.toml` 的键名 | **本次验证**：`[[IgnoredVulns]]` 对，`IgnoreVulns` 错 | OSV-Scanner 2.6.0：`[[IgnoredVulns]]`（`id`、`reason`，可选 `ignoreUntil`）→ 该公告被过滤，退出码 0；`[[IgnoreVulns]]` → `Failed to read config file: unknown keys in config file: IgnoreVulns…`，退出码 **127**（会报错，不会静默忽略） | §8.6.3 和附录 B 里的 `IgnoreVulns` 改为 `IgnoredVulns` |
| 9 | `dependency-review-action` 能不能读 `pnpm-lock.yaml` | **已证实**·CI 运行记录 | 它在真实 PR 上读了嵌套目录下的 pnpm 11 锁文件并按公告拦截：运行 38167104925 拦下 `spikes/k4/fixtures/next/pnpm-lock.yaml » next@16.3.6`（GHSA-cjq9-62q9-8jv4，高危）；38178214416 拦下 `spikes/k4/fixtures/vite/pnpm-lock.yaml » source-map-js@1.2.1`；38172081425 拦下 `spikes/k9/pnpm-lock.yaml » braces@3.0.3`；38172237051、38180415464 拦下 `spikes/k9`、`spikes/k1` 的 `source-map-js@1.2.1`。同类运行在移除这些锁文件后通过（如 38178295667、38180791222）。仓库里没有两段式锁文件，这一形态没有被它读过 | `security.yml` 里“能否读懂 pnpm 11 的 pnpm-lock.yaml【未核实】”的注释和 §8.6.3 的【未核实】改为已核实 |
| 10 | `corepack` 在 Node 24 里有没有 | **本次验证**，有 | 本机和三台 CI 的 Node 24.21.0 都带 `corepack 0.36.0`（本机 `~/.nvm/versions/node/v24.21.0/bin/corepack`；CI 运行 38183626171 日志）。技术设计 §8.6.6 记录的是 Node 25.6.0 里找不到 | §8.6.6 括号里的“Node 24 里有没有没查【未核实】”改为：Node 24.21.0 自带 corepack 0.36.0（25 起不再带）；我们不依赖它 |
| 11 | release-please 单版本号配置 | **本次验证**，成立（用库做的 dry-run） | `release-please/run.mjs`：release-please 命令行即使加 `--local`、`--dry-run` 也要连 GitHub API，所以这里直接用它的库：在临时目录建一次性 git 仓库，写一个只读本地 git 的 `Scm` 实现（写入方法全部抛错），交给 `Manifest.buildPullRequests()`，这正是 `release-pr --dry-run` 拿到 GitHub 数据之后做的那一步。没有网络、没有令牌。配置：`packages` 里只配根路径 `"."`、`release-type: node`、`include-component-in-tag: false`、`bump-minor-pre-major: true`、`bump-patch-for-minor-pre-major: true`，`apps/desktop/package.json` 和 `packages/cli/package.json` 用 `extra-files`（`type: json`、`jsonpath: $.version`）同步。结果：发版 PR 的更新文件列表里包含这两个文件；只改 `apps/desktop`、`packages/cli` 下文件的提交也照常触发发版（场景 M）；起始 0.3.0：`feat` → 0.3.1，`fix` → 0.3.1，`feat!` → 0.4.0，页脚 `BREAKING CHANGE:` → 0.4.0；起始 1.2.0：`feat` → 1.3.0，`fix` → 1.2.1，`feat!` → 2.0.0；只有 `chore/docs/ci` → 不生成发版 PR。16 + 4 个场景各 1 次 | 无。“1.0 之前：破坏性改动升次版本号，其余升修订号”对应的配置就是上面两个 `bump-*` 键，建议写进 §8.4。没有验证：release-please 作为 GitHub Action 或命令行在真实仓库上开发版 PR（需要令牌和仓库设置）→ 待 M5 第一次发版前 |
| 12 | 中文主题的提交能否正常进入更新日志和版本号 | **本次验证**，成立，有三处要写进规则 | 更新日志条目原样保留中文：`* **core:** 增加运行状态机 ([79ec69a](…))`；章节标题可以自定义成中文（`changelog-sections`，场景 N：“新功能 / 修复 / 性能”）。**页脚只认英文原词** `BREAKING CHANGE:`（场景 D 升次版本号，中文说明进更新日志）和 `BREAKING-CHANGE:`；写成“破坏性变更：”不触发（场景 E 只升修订号）。**全角冒号或括号**（`feat（core）：…`）整个提交被忽略，不进更新日志也不触发发版（场景 F）。冒号后没有空格、type 大写，release-please 仍能解析（场景 P、Q）——所以 `tooling/ci/check-title.ts` 的正则（`^([a-z]+)(?:\(([a-z0-9-]+)\))?(!)?: (.*)$`）比 release-please 更严，是安全的一侧。`feat(core)!:` 加页脚同时写，不重复计（场景 S） | §8.4 的“未核实”标记改为已核实，并补两句：页脚的 `BREAKING CHANGE:` 必须是英文原词；全角标点会让提交整个被 release-please 忽略（已由 PR 标题检查挡住）。更新日志默认章节标题是英文（Features / Bug Fixes），要中文需配 `changelog-sections` |
| 13 | Biome `noJsxLiterals` 按 §6.8 第 1 层的配置是否只拦该拦的 | **不成立**（原配置会误伤每一个 `t("key")`） | §6.8 写的配置 `noStrings: true` + `ignoreProps: true`：`{t("empty")}`、`{t("a.key", {n: 1})}`、`{fmt.date(x, "short")}` 里的字符串参数全部被当成界面文字拦下（夹具里 6 行只含 `t()` 调用的代码被误伤，另有 1 行 `{c ? t("a") : "否"}` 同时命中）。改成 `noStrings: false`（默认）后：拦住 `<p>还没有项目</p>`、`<p>No projects yet</p>`、`<p>© 2026</p>`；放行 `·` `›` `:`、`{t("…")}`、`{name}`、`className`/`data-*`/`key`/`id`/`role` 等所有属性、组件上的 `label`/`title`；在夹具上 0 处误伤（28 条诊断，全部落在标了 BAD 的行上）。它**漏掉**：`{"文字"}`、`` {`模板`} ``、`{c ? "是" : "否"}`、`{a || "默认"}`（`noStrings: false` 下不查表达式）。这一块用第二条 GritQL 规则补上（见 #14），无误伤 | §6.8 第 1 层的“`noStrings: true` 加 `ignoreProps: true`（也拦 `{'文字'}`，但不碰属性）”改为“`noStrings: false`，`ignoreProps` 无关紧要；`{'文字'}` 之类的表达式字面量由第 2 层的 GritQL 规则 `jsx-child-literal.grit` 拦”。`allowedStrings` 放行纯符号的用法验证有效 |
| 14 | GritQL 插件能否匹配“指定名字的 JSX 属性且值是字符串字面量” | **本次验证**，成立 | Biome 2.5.14，规则写在 `biome/fixture/rules/native-attr-literal.grit`：匹配 `JsxAttribute(name=…, initializer=JsxAttributeInitializerClause(value=…))`，名字是 `aria-label|title|placeholder|alt`，值是 `JsxString()` 或 `{"…"}` 或模板字符串，且所在元素是**原生元素**（标签名小写开头，用 `within` 取元素）。`<input aria-label="关闭" placeholder="搜索" title="提示" />` 三处全拦；`<Button label="保存" title="提示" aria-label="组件上的" />`、`aria-label={t("x")}`、`aria-label={name}`、`className`、`data-testid`、`key` 不拦。`plugins` 可以写在 `overrides` 里，按该 override 的 `includes` 生效（`apps/desktop/src/main` 里同样的写法不拦，测试文件不拦）。三个系统一致。**写法上的坑**：Grit 正则是整串匹配，要写 `r"[a-z].*"`，写 `r"^[a-z]"` 永远不匹配；节点名用 `JsxAttribute` 这种大驼峰，`jsx_attribute` 小写只在 `biome search` 里零星可用；同一个元素上多个属性要在属性层匹配（不要先匹配元素再 `contains`，那样一个元素只报第一处）。**第二条规则** `jsx-child-literal.grit` 匹配 `JsxExpressionChild` 里的字符串字面量、模板字符串、三元/`||`/`??`/`&&` 的字符串分支，`{t("key")}` 和 `{c ? t("a") : t("b")}` 不拦，`{c ? t("a") : "否"}` 拦 | §6.8 第 2 层的“写法在 K15 确认；不行就用第 4 层的扫描脚本加一条正则”改为“已确认可行，规则文件见 `spikes/k15/biome/fixture/rules/`，建 `ui` 包时原样搬进 `tooling/biome/`”。退路不需要 |
| 15 | macos-26 截图里的中文是不是苹方 | **本次验证**，是 | 用 Chromium 自己报告的实际渲染字体（`CSS.getPlatformFontsForNode`），不靠猜：macos-26 镜像 20260907.0351.1 上系统字体、`sans-serif`、指定 `"PingFang SC"`、指定 `"Microsoft YaHei"`（macOS 上不存在，回退）、字重 300 和 600、等宽字体里的中文，全部是**苹方**；拉丁字母是 `.SF NS`，代码用 `Menlo`。注意：runner 上报的字体族名是 `蘋方-簡`（繁体写法，系统本地化名），本机是 `PingFang SC`，所以比较字体名的断言不能写死英文名。Ubuntu 镜像里中文落到 `DejaVu Sans`（没有中文字体，会是方框）；Windows 是 `Microsoft YaHei` | §6.7 / 风险表“GitHub 的 macOS 机器上有没有苹方字体【未核实】”改为已核实（macos-26 有，且是默认中文字体）；`ui-visual` 只在 `macos-26` 上跑的设计正确，不要在 Ubuntu 上跑截图（没有中文字体） |
| 16 | 同一镜像上两次截图是否逐像素一致 | **本次验证**，一致（有边界） | 同一个页面（中文 + 拉丁，浅色和深色）：进程内连续两次、刷新后、同一浏览器的另一个标签页，4 张 PNG 的 SHA-256 完全相同；2 个独立的 macos-26 job × 每个 2 次独立进程运行 = 4 次，浅色 `b7a081676518…`、深色 `e60e28a8153d…` 全部相同（72 487 字节）；同样的实验在三次不同的工作流运行里（38183311644、38183626171、38184406784）共 12 次独立进程运行，哈希仍然相同。Ubuntu、Windows 同样自身一致（但与 macOS 的不同）。**边界**：只测了一张很小的静态页；没有动画、阴影、半透明毛玻璃、`backdrop-filter`；本机 Mac 的结果与 CI 的不同（字体名、系统版本不同），所以基准图必须在 `macos-26` 上生成（设计已经是这样）。用的是 Playwright 自带的 Chromium 153，不是 Electron 44 的 Chromium 152 | §13 风险表“留一点容差”仍然合理（镜像升级时字体渲染会变）。M2 开头第一件事（“基准图的第一次生成”）可以直接用本 spike 的 `playwright/shots.mjs` 做字体断言 |
| 17 | Playwright 对 Electron 44 的支持 | **本次验证**，可用 | Playwright 1.63.0 + Electron 44.4.5（`process.versions`：electron 44.4.5、chrome 152.0.7977.130、node 24.21.0、v8 15.2.124.28）：`_electron.launch({executablePath, args})` 在 macos-26、ubuntu-latest（`xvfb-run`，加 `--no-sandbox`）、windows-2025 三个系统上都启动成功，`firstWindow()`、截图、`evaluate` 都正常（CI 运行 38183626171，每系统 1 次）。官方文档对 Electron 仍标“实验性” | 无。§8.1 Playwright 一行可补“实测 1.63.0 + Electron 44.4.5 三系统可用” |
| 18 | `WebContentsView` 能否被 Playwright 找到并截图 | **本次验证**，能，不需要退路 | 最小 Electron 应用：一个 `BrowserWindow` 加一个 `WebContentsView`（`win.contentView.addChildView`）。`electronApp.windows()` 和 `electronApp.context().pages()` 都**直接列出视图里的页面**（标题 `preview`），`page.locator('#v').textContent()` 读到“预览视图 preview”，`page.screenshot()` 成功（macOS 9 872 字节、Ubuntu 5 243、Windows 8 433），`page.evaluate` 取得视图尺寸 640×320。退路也可用：`electronApp.evaluate(() => view.webContents.capturePage())` 得到同样大小的 PNG，`executeJavaScript` 读到同样的文字。三个系统各 1 次 | §11.1 K15 的退路“在主进程里执行脚本取预览内容”保留为备用但不需要；K7 里“Playwright 能否操作预览视图里的页面”可以改为已知可行（只剩内容安全策略、导航钩子等 K7 自己的问题） |
| 19 | Claude Code 钩子的字段名 | **已证实**·仓库 + 官方文档 | 仓库 `tooling/hooks/hook-input.ts` 的注释写明 2026-10-12 对照官方文档核实，用到 `hook_event_name`、`cwd`、`tool_name`、`tool_input.file_path`、`tool_input.command`、`stop_hook_active`。这次再对官方文档（code.claude.com/docs/en/hooks 与 hooks-guide）核对：通用输入字段 `session_id`、`transcript_path`、`cwd`、`permission_mode`、`hook_event_name` ✓；PreToolUse 的 `tool_name`、`tool_input.command` ✓；PostToolUse 对 `Write\|Edit` 读 `tool_input.file_path`（hooks-guide 示例）✓；Stop 钩子读 `stop_hook_active`（hooks-guide 写明“检查它是 true 就提前退出”，且 Claude Code 在连续阻止 8 次后会覆盖钩子）✓；设置里 `command` + `args`（不经 shell 的直接执行）、`timeout`（秒）、`matcher`、`${CLAUDE_PROJECT_DIR}` ✓。`.claude/settings.json` 的写法全部有文档依据 | §9.3 末尾“钩子收到的字段名……【未核实】”里的“字段名”部分改为已核实；“权限规则里的路径在 Windows 上的写法”仍未核实（见“待真机”） |
| 20 | SessionStart 钩子的输出怎样进入上下文 | **已证实**·官方文档 | 官方 hooks 文档：“`UserPromptSubmit`、`UserPromptExpansion`、`SessionStart`、`PostModelSwitch` 的纯文本标准输出会作为 Claude 能看到并据此行动的上下文”；也可以输出 JSON `hookSpecificOutput.additionalContext`；退出码 2 对 SessionStart 只给用户看 stderr。`tooling/hooks/session-start.ts` 打印警告并退出 0，符合 | §9.2 陷阱一③ 括号里的“钩子的输出怎样进入上下文【未核实】，K15”改为已核实 |
| 21 | 子智能体“跳过项目说明”的字段名 | **已证实**·官方文档 | 官方 sub-agents 文档的 frontmatter 表：`omitClaudeMd`，`true` 时子智能体不加载用户、项目、本地的 CLAUDE.md（“managed policy files still load”），需要 Claude Code v2.1.271 及以上；内置的 Explore 和 Plan 默认就跳过。`tooling/checks/agents-config.ts` 查的就是 `omitClaudeMd`，文档里同一页说明 AGENTS.md 也一并跳过（memory 文档：“subagents that skip project instructions skip these files too”） | §9.2 陷阱二①“选项的字段名【未核实】”改为已核实。可补一句：内置的 Explore 和 Plan 子智能体本来就不读项目说明，派它们干活的交代里同样要写“先读 AGENTS.md” |
| 22 | 让 `AGENTS.md` 静默失效的两个陷阱 | **已证实**·官方文档，另发现第三个 | memory 文档：`AGENTS.md` 只在工作目录及上级目录**没有** `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md` 时才读；`CLAUDE.local.md` 算数（文档原话：加一个就会让 Claude 不再读 `AGENTS.md`），`~/.claude/CLAUDE.md` 和 `.claude/rules/` 不算数；设置 `claude-md-and-agents-md` 两种都读；读 AGENTS.md 需要 v2.1.277。仓库的 `no-claude-md` 检查、`session-start.ts`、ADR 0004、根 `AGENTS.md` 开头的提示都与此一致。**第三个陷阱**（文档“When AGENTS.md support is unavailable”）：版本低于 v2.1.277、用 `/plugin` 关掉了读 `AGENTS.md` 的内置插件、升级后的第一次会话、以及 v2.1.281 之前的 Bedrock 或关闭遥测的会话——这些会话只读 `CLAUDE.md`，`AGENTS.md` 读不到 | §9.2 陷阱表补一行第三个陷阱：`no-claude-md` 查不到，SessionStart 钩子也看不出；对策与 ADR 0004 已有的“根 `AGENTS.md` 第一屏写最关键的规则 + `pnpm check`/CI 照样拦着”一致，不需要新机制；README 里对贡献者说明“要求 Claude Code 2.1.285 以上”已经覆盖前三种 |

### 二、附录 B 里指向 K15 的其他条目

| # | 条目 | 判定 | 证据 | 对设计的影响 |
| --- | --- | --- | --- | --- |
| B1 | Dependabot 提醒对公共仓库是否免费、是否支持 `pnpm-lock.yaml` | **已证实**·仓库当前状态 | 本仓库是公共仓库（`gh api repos/…` 的 `visibility: public`）。`gh api repos/paddychenc75/runyard/dependabot/alerts` 有一条已打开的提醒 #1：`source-map-js` GHSA-68fv-2mgg-jv7q（高危），`manifest_path: pnpm-lock.yaml`，2026-10-11T17:49:11Z 创建；每次推送时 GitHub 也会提示这条提醒。只测了根锁文件，`spikes/` 下嵌套锁文件没有对应的提醒 | §8.6.3 Dependabot 一行的【未核实】改为：公共仓库可用，支持根 `pnpm-lock.yaml`；嵌套目录的锁文件是否也被扫描没有证据 |
| B2 | OSV-Scanner 有没有按严重度过滤的选项 | **本次验证**，没有 | `osv-scanner scan source --help`（2.6.0）的全部选项里没有 severity、cvss、fail-on、min 之类的开关（`results/osv-darwin-arm64.json` 的 `helpFlags`）。只能按公告 ID 用 `[[IgnoredVulns]]` 忽略；输出里有 CVSS 数值，可以自己解析 JSON 过滤 | 与技术设计“不用它做闸门”一致，无需改动 |
| B3 | OSV-Scanner 对两段式锁文件是否静默漏扫 | **本次验证**，不漏 | 用 `pnpm add --config` 生成真正的两段式 `pnpm-lock.yaml`（开头一段环境锁 `configDependencies`，`---` 分隔符 2 个；`packageManager` 字段本身不产生两段）：单段、两段、目录递归三种扫描都找到 `braces@3.0.3` 的 GHSA-vfj7-8cjw-p6xm，退出码 1。官方可复用工作流（与 `nightly-security.yml` 同一个固定哈希）在 CI 里扫了仓库根 `pnpm-lock.yaml`（90 个包）和 `spikes/k1/pnpm-lock.yaml`、`spikes/k2/pty/pnpm-lock.yaml`（嵌套），报告 `source-map-js 1.2.1  GHSA-68fv-2mgg-jv7q  CVSS 8.7`（运行 38183626171）。本仓库自己的锁文件目前都是单段 | 附录 B 对应一项关闭 |
| B4 | `pnpm audit` 的退出码数值 | **本次验证**：1 | 带 `braces@3.0.3` 的锁文件：`--audit-level high` 退出码 **1**；`--audit-level critical` 退出码 0（输出仍列出 1 条高危）；无公告 → 0；`--json` 在有高危时退出码 1；注册表连不上：不加 `--ignore-registry-errors` 退出码 1，加了退出码 0，**两种情况都会先重试约 70 秒**（10 秒 + 1 分钟）；有高危且加了 `--ignore-registry-errors` 仍然是 1。`pnpm audit signatures`（已安装的 zod）退出码 0，输出“1 package has a verified registry signature” | §8.6.3 里“具体数值没有写【未核实】”改为“1（失败）/ 0（通过）”；`audit-gate.ts` 只看 JSON 的做法可保留。CI 里注册表不通时 `--ignore-registry-errors` 也要等约 70 秒，PR 任务的超时（10 分钟）够用 |
| B5 | `pnpm audit --audit-level` / `audit.level` | 本次顺带验证 | 见 B4：命令行 `--audit-level` 有效（high / critical 两档试过）。`audit.level` 配置项没试 | 无 |
| B6 | Renovate 的安全 PR 与 pnpm 最小发布年龄冲突 | **部分验证**：pnpm 一侧成立；Renovate 一侧**待第一个 Renovate 安全 PR** | pnpm 一侧见 #4：锁文件里有不满 14 天的版本会让 `pnpm install --frozen-lockfile` 失败，需要同一个 PR 里加 `minimumReleaseAgeExclude: pkg@version` 并带注释（`deps-policy` 已要求）。Renovate 一侧（它的安全更新会绕过它自己的年龄规则）是 Renovate 文档的说法，没有在本仓库运行过 Renovate | `renovate.json` 里“两者的冲突没有实测过【未核实】”改为“pnpm 一侧已实测（锁文件校验失败）；Renovate 一侧待第一个安全 PR”。建议：安全 PR 的 CI 红灯是预期的，PR 模板提示处理人加例外条目 |
| B7 | `overrides` 能否把 Nuxt 的 simple-git 强制升到 4.x 又不破坏开发工具 | **待 M1**（做 Nuxt 模板时） | 对象（Nuxt 模板）还不存在 | 无 |
| B8 | Go 1.21 起按 `go.mod` 自动下载工具链 | **本次验证**，成立 | ubuntu-latest 镜像自带 Go 1.24.13（`GOTOOLCHAIN=auto` 是默认值）。`go.mod` 写 `go 1.27.2` 后 `go run .`：第一次输出 `go: downloading go1.27.2 (linux/amd64)`，耗时 **9 秒**（第二轮 CI 8 秒），然后运行 `go1.27.2`；第二次 ≤ 1 秒（缓存在 `GOMODCACHE`，**253 MB**）；`GOTOOLCHAIN=local` 时报 `go: go.mod requires go >= 1.27.2 (running go 1.24.13; GOTOOLCHAIN=local)`，退出码 1（运行 38183804323、38184406784，各 1 次；Windows、macOS 没测，是同一个 Go 行为） | §8.6.5 内置模板表里 Go 一行（“≥ 1.26”）：用户本机 Go 版本旧，只要网络能访问 `proxy.golang.org`（或 `GOPROXY`），默认设置会自动下载模板 `go.mod` 要求的版本，不会失败，但第一次运行多约 9 秒、静默联网、占用约 253 MB 磁盘。检测 Go 版本的界面要区分“本机 Go 够新”和“靠自动下载”；`GOTOOLCHAIN=local` 时给出上面那句报错 |
| B9 | zod 生成 JSON Schema 的接口名 | **本次验证**（建仓库时项，顺带） | zod 4.6.5：`typeof z.toJSONSchema === "function"`，输出 JSON Schema 2020-12（`$schema`、`type`、`properties`、`required`、`additionalProperties: false`，`int` 带 ±9007199254740991 的范围）；不需要 `zod-to-json-schema` | §8.1 zod 一行的“生成 JSON Schema 的接口名【未核实】”改为已核实：`z.toJSONSchema()` |
| B10 | Electron 44 内置的 Node 具体版本 | **已证实**·K1 + 本次 | K1 README 实测 24.21.0；本次 Playwright 在 macOS、Linux、Windows 三台 CI 上读 `process.versions`：node 24.21.0、chrome 152.0.7977.130、electron 44.4.5（附录 B 里它指向 K3/K5，顺带记录） | 技术设计 §8.1 Electron 一行：官方时间表写的 24.18.1 作废，以实测 24.21.0 为准；Chromium 152 也已实测 |
| B11 | 已知智能体的环境变量名 | **本次观察**（只有 Claude Code） | 在 Claude Code 2.1.296 的子智能体会话里：`CLAUDECODE=1`、`AI_AGENT=claude-code_2-1-296_agent`、`CLAUDE_CODE_ENTRYPOINT=cli`。其他智能体（Codex、Cursor、Gemini CLI）没有安装，**未验证** | §5.3 里“已知智能体自己的环境变量名【未核实】”：Claude Code 写 `CLAUDECODE`（等于 1）；`AI_AGENT` 是跨工具的约定名，值里带工具名和版本 |

### 三、“顺带确认的小项”

| # | 条目 | 判定 | 证据 | 对设计的影响 |
| --- | --- | --- | --- | --- |
| C1 | 端口连接数采样能不能看到热更新的长连接 | **本次验证**，能 | 数 `127.0.0.1:端口` 上已建立（ESTABLISHED）连接：macOS/Linux 用 `lsof -nP -iTCP:端口 -sTCP:ESTABLISHED`，Windows 用 `netstat -ano -p TCP`。真实 Vite 7.3.6 开发服务器：无连接 0 → 用 Node 的 `WebSocket`（子协议 `vite-hmr`，带从 `/@vite/client` 取的 token）连上后 **2**（同机的客户端和服务端各出现一次）→ 关闭后 0。macOS（本机）、macos-26、ubuntu、windows 四处都是 0 → 2 → 0（Windows 上这次没有从 `/@vite/client` 里取到 token，连接仍建立并数到 2）。普通 HTTP 短请求（`Connection: close`）采样不到。**边界**：用 Node 的 WebSocket 代替了真浏览器；浏览器自己的 keep-alive 连接也会被数进去（用默认 `fetch` 时验证过：一次请求后空闲 keep-alive 连接会让计数停在 2~4），所以“有连接”≠“有活动”，只能当“有浏览器连着”的信号 | §4.6 空闲停止里“采样能否看到热更新的长连接【未核实】”改为：能看到，但它表示“有页面连着”，不表示有活动；活动仍以日志和请求数为准 |
| C2 | pnpm 在没有终端时的确认提示 | **本次验证**：不会卡住，会报错 | 触发“要清空 node_modules 重装”的确认（装好后把 `shamefullyHoist` 打开再装）：无终端、无 CI → 立即失败，`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，退出码 1；`CI=true` → 自动同意并成功，退出码 0；`--config.confirmModulesPurge=false` → 成功；环境变量 `npm_config_confirm_modules_purge=false` → **无效**，仍失败。macOS 本机和 macos-26、ubuntu、windows 三台 CI 结果一致（CI 运行 38184406784；**注意**：GitHub 的机器上 pnpm 还会靠 `GITHUB_ACTIONS` 认出“在 CI 里”，实验里把它一并清空才测到“没有 CI”的情形——第一轮没清，结果全是自动同意）。试过的其他设置变化（`nodeLinker`、`virtualStoreDir`、`modulesDir`）在 pnpm 11 里根本不弹确认。K2 README 记录了重装时没有设 `CI` 也没停在确认上 | 管理进程调用 `pnpm install` 时不设 `CI=1`（K4 的结论：会改变 pnpm 默认行为）；遇到 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` 时当作“需要重装依赖”的可处理错误，带 `--config.confirmModulesPurge=false` 重试 |
| C3 | `node --check` 式的 TS 语法检查接口（Node 22.18+） | **本次验证**：`node --check` 不能用，用 `module.stripTypeScriptTypes` | `node --check ok.ts`（合法的 TS）也报 `SyntaxError: Missing initializer in const declaration`——`--check` 按 JS 解析，不剥类型（Node 24.21.0 和 22.18.0 都是）。`require("node:module").stripTypeScriptTypes(code)` 在 22.18.0 和 24.21.0 里都存在：合法代码返回剥完类型的文本；`enum` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`；语法错 → `ERR_INVALID_TYPESCRIPT_SYNTAX`；24.21.0 打 `ExperimentalWarning`。`process.features.typescript` 为 `"strip"`。3 个系统一致 | 设计里“脚本语法检查”写成：对 `.ts` 脚本用 `stripTypeScriptTypes` 做语法检查（捕获并忽略实验警告），不要用 `node --check` |
| C4 | `localhost` 与 `127.0.0.1` 的差别 | **本次验证** | `dns.lookup("localhost", {all: true})` 在 macOS 本机和 macOS/Ubuntu/Windows 三台 CI 上都是 `["::1", "127.0.0.1"]`（IPv6 在前）。Node 24 的 `fetch`（默认 `autoSelectFamily`）：服务只绑 `127.0.0.1` 时用 `http://localhost` 访问成功（≤ 8 ms），只绑 `::1` 时也成功；但用 `http://127.0.0.1` 访问只绑 `::1` 的服务 → `ECONNREFUSED`，用 `http://[::1]` 访问只绑 `127.0.0.1` 的服务 → `ECONNREFUSED`；绑 `::` 双栈都通。Chromium 对 `localhost` 的行为没有单独测 | 预览地址和健康检查用服务实际绑定的那个主机字面量（模板启动时指定 `--host 127.0.0.1`），别在 `localhost` 与 `127.0.0.1` 之间混用；浏览器侧 `localhost` 的行为留到 K7 |
| C5 | 系统是否提供 URL scheme 链接的发起方 | **待 M2**（桌面外壳实现 `runyard://` 处理时） | 需要注册了协议的应用才能测。检查方法：在 `app.on("open-url")`（macOS）和 `second-instance` 的 `commandLine`（Windows）里打印全部参数，确认里面没有发起进程或来源页 | 保持设计现状（来源只能是链接里自称的 `source=`） |
| C6 | `setup.errors` 里的错误字样 | **待 M1**（模板和 `setup.errors` 一起落地时，对着真实失败输出逐条校对）；Windows 部分待 K10 | 需要真实模板在真实失败时的输出；本 spike 只看到了 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`、`ERR_PNPM_IGNORED_BUILDS`、`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 这几个 pnpm 错误码的真实文字（见 #3、#4、C2），可加进 `setup.errors` 的匹配表 | 把这三个 pnpm 错误码加入 §4.4 `errors` 表（用错误码匹配比用英文句子稳） |
| C7 | Node 禁止直接执行 `.cmd` 的细节（附录 B “M0 小项”） | **本次验证**（windows-2025，1 次） | Node 24.21.0：`spawnSync("pnpm", ["-v"])` 不经 shell → `ENOENT`（找不到，因为 Windows 上只有 `pnpm.cmd`/`pnpm.ps1`）；`spawnSync("pnpm.cmd", ["-v"])` 不经 shell → **`EINVAL`**（Node 为防命令注入拒绝直接执行 `.cmd`/`.bat`）；`shell: true` → 成功，输出 11.28.0；`spawnSync("cmd.exe", ["/d","/s","/c","pnpm -v"])` → 成功。第一轮 CI 里实验脚本直接调 `pnpm` 就是因此全部失败的（`status: null`） | 与 K4 的结论一致：Windows 上起 `pnpm` 必须经 `cmd.exe /d /s /c` 或 `shell: true`；`@runyard/platform` 的“启动进程”封装要处理这一点（参数里有用户输入时用 `cmd.exe /d /s /c` 并自己转义，不要用 `shell: true` 拼字符串） |

## 需要改技术方案的地方

按重要程度排序，括号里是核对表的序号：

1. **§6.8 第 1 层的 Biome 配置不能照抄**（#13）：`noStrings: true` 会把每个 `t("key")` 的参数当成界面文字拦下。改为 `noStrings: false`，表达式里的字面量交给 GritQL 规则 `jsx-child-literal.grit`；第 2 层的原生元素属性规则 `native-attr-literal.grit` 已验证可用（#14）。两条规则的文件和夹具都在 `biome/fixture/`。
2. **`minimumReleaseAgeExcludePrune` 不是“满 14 天自动清除”**（#5）：它清掉的是锁文件不再用的版本。§8.1 Vite 一行、`pnpm-workspace.yaml` 的注释要改；例外条目满 14 天后要手动删。
3. **§8.6.4 第 7 步要写明**：锁文件里有不满 14 天的版本而没有例外条目，`pnpm install --frozen-lockfile` 直接失败（#4）。
4. **`osv-scanner.toml` 的键名是 `[[IgnoredVulns]]`**，写成 `IgnoreVulns` 会报错退出 127（#8）。
5. **`trustPolicy: no-downgrade` 现在不要开**（#7）：真实依赖树上拦下 `semver@6.3.1`、`@octokit/endpoint@9.0.6` 等正常旧版本。要开就配 `trustPolicyIgnoreAfter: 129600`。
6. **§3.3 补一句 Biome 的覆盖规则**：同一条规则被多个 `overrides` 命中同一文件时，后一条整体替换前一条（#1）。
7. **包写法的约束**写进 `packages/*/AGENTS.md`（#2）：包内 `.ts` 扩展名、可擦除语法、`import type`、不用 `paths`；包只能以工作区链接被引用。
8. **§9.2 补第三个陷阱**（#22）：版本低于 v2.1.277、关掉读 `AGENTS.md` 的内置插件、升级后第一次会话等情况只读 `CLAUDE.md`。
9. **脚本语法检查**用 `module.stripTypeScriptTypes`，不是 `node --check`（C3）。
10. **Go**（B8）：本机 Go 版本旧不会失败，会自动下载，第一次多约 9 秒；`GOTOOLCHAIN=local` 时有固定报错。
11. 各处“【未核实】”标记按核对表改为已核实：#6、#9、#10、#12、#15、#19、#20、#21、B1 到 B4、B9、B10、C1。
12. **现状提醒（不是设计问题，但会马上发生）**：仓库根 `pnpm-lock.yaml` 里有 `source-map-js@1.2.1`（vitest 经 vite 间接依赖，开发依赖），带高危公告 GHSA-68fv-2mgg-jv7q（修复版 1.2.2 于 2026-09-30 发布，到 2026-10-14 才满 14 天）。`pnpm audit --prod` 退出码 0 所以 PR 闸门是绿的；但每晚任务的全量审计（含开发依赖）会失败并自动开 issue。Dependabot 提醒 #1 已经是打开状态。处理办法在 2026-10-14 之后升级，或现在在 `security/allowlist.toml` 登记（要先问）。

## 留到以后的检查

| 检查 | 里程碑 | 做法 |
| --- | --- | --- |
| release-please 在真实仓库上开发版 PR、合并后打标签 | M5 第一次发版前（或 M1 结束时空跑一次） | 用 `googleapis/release-please-action` 固定哈希，仓库设置里允许 Actions 创建 PR；对照本 spike 的 20 个场景核对版本号 |
| `ui` 包建立后把两条 Grit 规则搬进 `tooling/biome/` 并跑通 `pnpm lint` | M2 第一个界面 PR | 夹具改成仓库里的真实路径；`biome.json` 的 `plugins` 用 `includes` 限定范围 |
| 基准图第一次生成时再核对字体名断言 | M2 第一个界面 PR | 用 `CSS.getPlatformFontsForNode` 断言中文是苹方，名字同时接受 `PingFang SC` 和 `蘋方-簡` |
| `runyard://` 的发起方信息 | M2 | 见 C5 |
| Nuxt 模板树上再试 `trustPolicy`；`overrides` 升级 simple-git | M1 做 Nuxt 模板时 | 见 #7、B7 |
| `setup.errors` 的真实错误字样 | M1（Windows 部分 K10） | 见 C6 |
| Renovate 第一个安全 PR | Renovate 装好之后 | 见 B6 |
| 嵌套目录的 Dependabot 提醒 | 有嵌套锁文件时（模板的锁文件） | 看提醒页是否出现 `templates/*/pnpm-lock.yaml` |
| Claude Code 权限规则里路径在 Windows 上的写法 | MW 或第一次在 Windows 上开发时 | 见下面“待真机” |

## 对照通过标准

K15 一行的通过标准是“各自能用”，退路是“各有替代：检查脚本、构建一步、手动发版、在主进程里执行脚本取预览内容”。

| 通过标准 | 判定 | 证据 |
| --- | --- | --- |
| Biome 按目录配置 | 通过（带覆盖规则的陷阱） | #1 |
| Node 24 直接运行另一个包的 `.ts` | 通过（带写法约束） | #2 |
| pnpm 11 的 `allowBuilds`、年龄校验 | 通过 | #3、#4 |
| `minimumReleaseAgeExcludePrune` | 与设计的理解不符，需改文字，功能可用 | #5 |
| `trustPolicy` 不误伤 | 不通过，改为不开 / 配 `trustPolicyIgnoreAfter` | #7 |
| `osv-scanner.toml`、`dependency-review-action`、`corepack` | 通过 | #8、#9、#10 |
| release-please 单版本号与中文提交 | 通过（库级别，未跑真实仓库） | #11、#12 |
| `noJsxLiterals` 按 §6.8 配置 | 不通过，改 `noStrings: false` + Grit 规则 | #13 |
| GritQL 匹配指定属性 | 通过 | #14 |
| macos-26 苹方、截图逐像素一致 | 通过 | #15、#16 |
| Playwright 对 Electron 44 与预览视图 | 通过，不需要退路 | #17、#18 |
| Claude Code 钩子字段名等 | 通过（已有证据 + 官方文档） | #19 到 #22 |

## 需要在负责人的 Windows 真机上复核的内容

| 内容 | 为什么 |
| --- | --- |
| Claude Code 权限规则（`.claude/settings.json` 的 `Edit(/docs/product/**)` 这类路径）在 Windows 上怎么写 | 官方文档的路径写法在 Windows 上没有测过；GitHub 的 Windows 机器没有装 Claude Code |
| 钩子脚本（`node ${CLAUDE_PROJECT_DIR}/tooling/hooks/*.ts`）在 Windows 上被 Claude Code 实际调用 | `args` 不经 shell 的写法有文档，但没有在 Windows 上跑过 Claude Code |
| 中文区域的 Windows 11 上 Electron + Playwright 的字体（`Microsoft YaHei` 是否被选中，字重 300 是否回退） | CI 机器是英文区域的 Windows Server；只确认了 YaHei 能被选中，没测字重 |
| `pnpm audit` 在国内网络环境访问 npm 注册表时的重试时间（本次测到不通时先重试约 70 秒） | 真实网络环境 |
| `go` 自动下载工具链在国内网络（`proxy.golang.org` 可能不通）下的表现 | 需要真机网络；设置 `GOPROXY` 才能解决 |

## 安装过的依赖和查过的内容

本 spike 自己没有依赖（`package.json` 无 `dependencies`），也没有提交任何锁文件；下面的包都在临时目录或 CI 运行时安装，全部满足 14 天规则，临时项目的 `pnpm-workspace.yaml` 都带 `minimumReleaseAge: 20160`（只有两个“制造条件”的实验为演示年龄规则故意设过 0，见 #4、B3、B4）。

| 包 | 版本 | 发布日期 | 用途与检查 |
| --- | --- | --- | --- |
| `@biomejs/biome` | 2.5.14 | 2026-09-16（26 天） | 与根 catalog 一致；`pnpm deps:lookup` 见 `docs/architecture/dependencies.md`（A、B、C 无公告） |
| `release-please` | 17.11.2 | 2026-08-24（49 天） | 与技术设计 §8.1 一致，只在临时目录用库做 dry-run（`dependencies.md` 已记录 A、B、C 无公告）。它的 162 个间接依赖没有逐个查，只在临时目录运行 |
| `playwright` | 1.63.0 | 2026-09-04（38 天） | 与 `dependencies.md` 一致（无公告） |
| `electron` | 44.4.5 | 2026-09-23（19 天） | 与 `dependencies.md` 一致；K1 已查，无安装脚本，二进制由包内 `checksums.json` 校验 |
| `vite` | 7.3.6 | 2026-06-25（109 天） | 只在临时目录里起开发服务器几秒（只绑 `127.0.0.1`）；它自己有 GHSA-rq7h-c2jc-7f22（中）、GHSA-9jrq-w75r-8gcw（低），修复版 7.3.7 发布不满 14 天不能装；间接依赖 `source-map-js@1.2.1` 有高危 GHSA-68fv-2mgg-jv7q，所以**不提交锁文件**。K1 已用同一版本 |
| `zod` | 4.6.5 | 2026-09-13（29 天） | 测 `z.toJSONSchema`；同根 catalog |
| `esbuild` | 0.25.12 | 2025-11-01（约 345 天） | 只用来测 `allowBuilds`（它有 postinstall）；临时目录，不提交 |
| `braces` | 3.0.3 | 2024-05-21 | **故意**装的带高危公告（GHSA-vfj7-8cjw-p6xm）的包，只用来测 `pnpm audit` 和 OSV 的退出码，只生成锁文件、不进仓库；`semver`、`@octokit/*` 等是 #7 实验里的间接依赖，未单独查 |
| `is-number` | 7.0.0 | 2018-07-04 | 测 `pnpm add --config`（两段式锁文件）和 `minimumReleaseAgeExclude` 的清理 |
| `osv-scanner` 二进制 | v2.6.0（`osv-scanner_darwin_arm64`） | 2026-09-14 | 从官方 GitHub Release 下载到临时目录，按同一发布里的 `osv-scanner_SHA256SUMS` 核对 SHA-256（`98c460dc…56b4`），用完删除；只校验了完整性，没有校验 SLSA 来源证明（`multiple.intoto.jsonl`） |

GitHub Actions：`actions/checkout`、`pnpm/action-setup`、`actions/setup-node` 沿用 `ci.yml` 的提交哈希；`actions/upload-artifact@043fb46d…`（v7.0.1，2026-04-10）沿用 `spike-k6.yml`；`google/osv-scanner-action/.github/workflows/osv-scanner-reusable.yml@a345acff…`（v2.6.0）沿用 `nightly-security.yml`。没有新增 Action。注意：这个可复用工作流内部再引用 `actions/download-artifact` 和 `osv-scanner-action@7f58dd67…`，它们是上游固定的哈希。

## 清理确认

- 所有实验的临时目录由 `lib.mjs` 登记，进程退出（含失败、被打断）时统一删除；本机收尾时核对过：没有 `k15-*` 临时目录，没有残留进程（Vite 子进程由实验自己结束，只对自己启动的进程号动手；没有用按名字结束进程的命令），没有残留监听端口（实验用的端口都是系统分配的临时端口）。
- 没有碰 `~/Runyard`、`~/.runyard`。pnpm 的共享 store（`~/Library/pnpm/store`）在运行根目录的 `pnpm install` 时写入过，各实验的 store 和缓存都放在各自的临时目录里随之删除。Playwright 浏览器下载在本机调试时放在临时目录，已删除。
- 本机实验里下载的 `osv-scanner` 在临时目录，已删除。
- GitHub 上：每个 job 的产物保留 14 天；OSV 可复用工作流把一份 SARIF 上传到了仓库的 Security 页（这是它的默认行为，与 `nightly-security.yml` 相同）；没有创建任何 issue、PR 评论或 release。
- 推送轮次：共 5 轮（CI 运行 38183311644 因 Windows 上直接调 pnpm 失败而重做、38183626171、38183804323、38184406784，最后一轮是只改 README 的推送），不超过 12 轮的上限。
