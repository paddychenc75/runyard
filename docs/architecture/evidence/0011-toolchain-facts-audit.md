# 证据：工具链事实核对（决策记录 0011）

本文是 [决策记录 0011](../decisions/0011-toolchain-facts-audit.md) 的完整证据，自成一体：做 M0a 的技术验证 K15 时留下的实验代码已经删除，所有结论、数字和两条要保留的规则都在这里。

## 问题与方法

技术设计 §11.1 的 K15 一行和附录 B 里若干条列着“用记忆写的、没验证过”的工具链细节。K15 不是新实验，是审计：每一项判成 (a) 仓库里已经证明；(b) 做最小实验证明；(c) 对象还不存在，等后面的里程碑；(d) 不成立，要改设计。已经证明的不重做。每项实验在临时目录里装依赖、跑完删除；“重复”指独立运行的次数。

## 环境

| 环境 | 内容 |
| --- | --- |
| 负责人的 Mac | macOS 27.0.1（arm64，Apple M3 Max），Node 24.21.0，pnpm 11.28.0，Python 3.14.3 |
| `macos-26` | 镜像 `macos26 20260907.0351.1`，macOS 26.6.2（arm64），Node 24.21.0 |
| `ubuntu-latest` | Ubuntu 24.04.5，镜像 `20261004.327.1`，Node 24.21.0，Go 1.24.13（镜像自带） |
| `windows-2025` | GitHub 托管的 Windows Server（管理员账号，Defender 按 CI 配置），Node 24.21.0 |
| 工具版本 | Biome 2.5.14、release-please 17.11.2、OSV-Scanner 2.6.0、Playwright 1.63.0、Electron 44.4.5、Vite 7.3.6（只用来测热更新连接）、zod 4.6.5 |

`windows-2025` 是服务器版，不是负责人的 Windows 11：所有 Windows 结论只是近似。

## 证据出处

- 合并的 PR：#6（K15 的全部实验代码和 README，已合并）。
- GitHub Actions 运行：[38183311644](https://github.com/paddychenc75/runyard/actions/runs/38183311644)（Windows 上直接调 `pnpm` 失败，重做）、[38183626171](https://github.com/paddychenc75/runyard/actions/runs/38183626171)、[38183804323](https://github.com/paddychenc75/runyard/actions/runs/38183804323)、[38184406784](https://github.com/paddychenc75/runyard/actions/runs/38184406784)；另一个只改说明的推送轮次。共 5 轮推送。
- 依赖变更审查在真实 PR 上读 `pnpm-lock.yaml` 的运行（表中 #9）：[38167104925](https://github.com/paddychenc75/runyard/actions/runs/38167104925)、[38178214416](https://github.com/paddychenc75/runyard/actions/runs/38178214416)、[38172081425](https://github.com/paddychenc75/runyard/actions/runs/38172081425)、[38172237051](https://github.com/paddychenc75/runyard/actions/runs/38172237051)、[38180415464](https://github.com/paddychenc75/runyard/actions/runs/38180415464)；移除锁文件后通过的 38178295667、38180791222。

## 一、K15 一行里的逐项（22 项）

| # | 条目 | 判定 | 证据 | 后果 |
| --- | --- | --- | --- | --- |
| 1 | Biome 按目录配置禁用导入 | 成立，有一处陷阱 | `overrides[].includes` 分目录：packages/core 导入 `electron` 被 `noRestrictedImports` 拦，`packages/protocol` 导入 `node:fs` 被 `noNodejsModules` 拦，桌面主进程不拦；`!**/*.test.tsx` 排除有效；三系统一致（38183626171）。陷阱：同一条规则被两个 override 命中时，后一个的 `options` 整体替换前一个，不合并（`packages/**` 禁 `electron`，packages/ui/src/base/** 再加 `patterns` 后，基础组件目录里的 `electron` 导入漏掉） | §3.3：更具体的 override 必须把 `paths` 和 `patterns` 全部重写；`ui-layers` 以脚本为准不变 |
| 2 | Node 24 直接运行另一个包的 `.ts` | 成立，写法有约束 | 工作区链接的包，`"exports": "./src/index.ts"`。能跑：函数与常量导入、`import type`、`import { type X }`、`.ts` 扩展名相对导入、`as`/`satisfies`/泛型。报错：不写 `type` 导入类型名（`SyntaxError: does not provide an export`）；`enum`、`namespace`、参数属性（`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`）；相对导入不写 `.ts`（`ERR_MODULE_NOT_FOUND`）；tsconfig `paths`；包被复制进 `node_modules`（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）；包没有 `"type": "module"` 能跑但每次警告。macOS 本机加三台 CI 一致 | 仓库 tsconfig 已有 `erasableSyntaxOnly`、`verbatimModuleSyntax`、`allowImportingTsExtensions`。包的说明文件写：`.ts` 扩展名、可擦除语法、`import type`、不用 `paths`、只能以 `workspace:*` 引用。§8.2 成立 |
| 3 | pnpm 11 `allowBuilds` | 成立 | esbuild 0.25.12 测 5 种：不写 → `ERR_PNPM_IGNORED_BUILDS`（退出码 1）；`{esbuild: true}` → 运行（0）；`{esbuild: false}` → 不运行（0）；旧写法 `onlyBuiltDependencies` 不再生效（1）；`strictDepBuilds: false` → 只警告（0）。仓库写法一致，CI 三系统全绿。`electron@44.4.5` 没有安装脚本，`allowBuilds` 对它不起作用 | “添加依赖”手册可加一句：pnpm 11 不认 `onlyBuiltDependencies` |
| 4 | `minimumReleaseAge` 重新校验锁文件 | 会重新校验 | 先用 `minimumReleaseAge: 0` 把发布不满 14 天的 `zod@4.6.6` 写进锁文件，再改成 20160：`pnpm install --frozen-lockfile`、`pnpm install`、`pnpm install --lockfile-only --force` 都以 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 失败，退出码 1。无锁文件时全新解析同版本 `ERR_PNPM_NO_MATURE_MATCHING_VERSION`；`pnpm add zod` 自动取满 14 天的 4.6.5。例外条目写 `zod@4.6.6` 或裸包名都放行 | §8.6.4 第 7 步：锁文件里有不满 14 天的版本而没有例外条目，CI 的冻结安装直接失败，例外条目要和锁文件同一个 PR |
| 5 | `minimumReleaseAgeExcludePrune` | 不成立（与设计理解不符） | 设计写“满 14 天自动清除”。实测：`zod@4.6.5`（满 29 天、锁文件在用）保留；`zod@4.6.6`（不满 14 天、锁文件不再用）、`left-pad@1.3.0`、`ms`、不存在的包被清掉；`zod@4.6.6` 在用且不满 14 天时保留，升级到 4.6.5 后才清。`install` 和 `add` 都会清。它清掉的是“锁文件已不再解析到的版本”，与年龄无关 | 条目一直留到依赖升级、锁文件不再用那个版本为止；满 14 天后要手动删。`deps-policy` 可加一条：条目对应版本已满 14 天时提示删除 |
| 6 | `packageManager` 自动切换 | 已证实（§8.6.6） | 2026-10-12 隔离目录实测；仓库 CI 用 `pnpm/action-setup` 读 `packageManager` 全部通过 | 无 |
| 7 | `trustPolicy: no-downgrade` 误伤 | 会误伤，不要原样启用 | 仓库当前树（90 个包）开启后冻结安装与全新解析通过。对 §8.1 里 Electron + Vite + React + Astro 等 20 个直接依赖的树（约 900 个包）：`ERR_PNPM_TRUST_DOWNGRADE`，先拦 `semver@6.3.1`（经 `@babel/core`），再拦 `@octokit/endpoint@9.0.6`（经 `release-please`），都是正常旧版本补丁；逐个 `trustPolicyExclude` 要 2 条。`trustPolicyIgnoreAfter`（分钟）20160、129600、525600 三档都装得上；因为装进来的版本都已满 14 天，它不能 ≤ 20160，否则等于不检查 | 现在不开。将来要开，同时设 `trustPolicyIgnoreAfter: 129600` 并在 Nuxt、Next 模板的树上再试 |
| 8 | `osv-scanner.toml` 键名 | `[[IgnoredVulns]]` 对，`IgnoreVulns` 错 | OSV-Scanner 2.6.0：`[[IgnoredVulns]]`（`id`、`reason`，可选 `ignoreUntil`）→ 过滤，退出码 0；`[[IgnoreVulns]]` → `Failed to read config file: unknown keys…`，退出码 127（报错，不会静默忽略） | §8.6.3、附录 B 里的键名改为 `IgnoredVulns` |
| 9 | `dependency-review-action` 读 `pnpm-lock.yaml` | 已证实（CI 记录） | 在真实 PR 上读了嵌套目录下的 pnpm 11 锁文件并按公告拦截（见上面的运行号：next@16.3.6 的 GHSA-cjq9-62q9-8jv4、`source-map-js@1.2.1`、`braces@3.0.3`）；移除后通过。仓库里没有两段式锁文件，这一形态没被它读过 | 相关【未核实】改为已核实 |
| 10 | Node 24 带 `corepack` | 有 | 本机和三台 CI 的 Node 24.21.0 都带 corepack 0.36.0；§8.6.6 记录的是 Node 25.6.0 里找不到 | 我们不依赖它 |
| 11 | release-please 单版本号配置 | 成立（库级 dry-run） | 命令行即使 `--local --dry-run` 也要连 GitHub，所以直接用库：一次性 git 仓库 + 只读本地 git 的 `Scm` 实现（写入方法全抛错）+ `Manifest.buildPullRequests()`。配置：`packages` 只配根 `"."`、`release-type: node`、`include-component-in-tag: false`、`bump-minor-pre-major: true`、`bump-patch-for-minor-pre-major: true`，apps/desktop/package.json 和 packages/cli/package.json 用 `extra-files`（`type: json`、`jsonpath: $.version`）。结果：发版 PR 更新这两个文件；只改这两个目录的提交也触发发版；0.3.0 起 `feat` → 0.3.1，`fix` → 0.3.1，`feat!` → 0.4.0，页脚 `BREAKING CHANGE:` → 0.4.0；1.2.0 起 `feat` → 1.3.0，`fix` → 1.2.1，`feat!` → 2.0.0；只有 `chore/docs/ci` 不生成发版 PR。16 + 4 个场景各 1 次 | 两个 `bump-*` 键写进 §8.4。没验证：作为 GitHub Action 或命令行在真实仓库开发版 PR（需令牌和设置），待 M5 第一次发版前 |
| 12 | 中文主题进更新日志和版本号 | 成立，三处进规则 | 更新日志条目原样保留中文；章节标题可用 `changelog-sections` 改中文（默认英文 Features / Bug Fixes）。页脚只认英文原词 `BREAKING CHANGE:` 和 `BREAKING-CHANGE:`，“破坏性变更：”不触发。全角冒号或括号（`feat（core）：…`）整个提交被忽略，不进更新日志也不触发发版。冒号后无空格、type 大写 release-please 仍能解析，所以 `check-title` 的正则比它更严（安全的一侧）。`feat(core)!:` 加页脚不重复计 | 规则写入 §8.4 和贡献说明（全角冒号由 PR 标题检查挡住） |
| 13 | `noJsxLiterals` 按 §6.8 配置 | 不成立 | 原配置 `noStrings: true` 加 `ignoreProps: true` 把 `{t("empty")}`、`{t("a.key", {n: 1})}`、`{fmt.date(x, "short")}` 里的字符串参数全当界面文字拦下（夹具 6 行只含 `t()` 调用的代码被误伤）。改 `noStrings: false`：拦 `<p>还没有项目</p>`、`<p>No projects yet</p>`、`<p>© 2026</p>`；放行 `·` `›` `:`、`{t("…")}`、`{name}`、所有属性、组件上的 `label`/`title`；夹具上 0 处误伤（28 条诊断全在标 BAD 的行）。漏掉：`{"文字"}`、模板字符串、`{c ? "是" : "否"}`、`{a \|\| "默认"}` | 第 1 层改 `noStrings: false`；表达式字面量由规则二（见下）拦 |
| 14 | GritQL 匹配指定 JSX 属性且值为字符串 | 成立 | Biome 2.5.14。`<input aria-label="关闭" placeholder="搜索" title="提示" />` 三处全拦；`<Button label="保存" title="提示" aria-label="组件上的" />`、`aria-label={t("x")}`、`aria-label={name}`、`className`、`data-testid`、`key` 不拦。`plugins` 可写在 `overrides` 里，按该 override 的 `includes` 生效；主进程目录、测试文件不拦。三系统一致。坑：Grit 正则整串匹配，写 `r"[a-z].*"` 而非 `r"^[a-z]"`；节点名用大驼峰 `JsxAttribute`；同一元素多个属性要在属性层匹配，不要先匹配元素再 `contains`（那样只报第一处）。规则二：匹配 `JsxExpressionChild` 里的字符串字面量、模板字符串、三元 / `\|\|` / `??` / `&&` 的字符串分支，`{t("key")}` 和 `{c ? t("a") : t("b")}` 不拦，`{c ? t("a") : "否"}` 拦 | 两条规则原样写入 §6.8，建 `ui` 包时放进 tooling/biome/；退路不需要 |
| 15 | macos-26 截图里中文是苹方 | 是 | Chromium 自报渲染字体（`CSS.getPlatformFontsForNode`）：系统字体、`sans-serif`、指定 `"PingFang SC"`、指定 `"Microsoft YaHei"`（回退）、字重 300 和 600、等宽字体里的中文，全是苹方；拉丁字母 `.SF NS`，代码 `Menlo`。runner 上报族名 `蘋方-簡`，本机 `PingFang SC`，断言不能写死英文名。Ubuntu 中文落到 `DejaVu Sans`（无中文字体）；Windows 是 `Microsoft YaHei` | `ui-visual` 只在 `macos-26` 跑；不在 Ubuntu 跑截图 |
| 16 | 同镜像两次截图逐像素一致 | 一致（有边界） | 同一页面（中文 + 拉丁，浅色和深色）：进程内两次、刷新后、另一标签页，4 张 PNG 的 SHA-256 相同；2 个独立 `macos-26` job × 每个 2 次 = 4 次，浅色 `b7a081676518…`、深色 `e60e28a8153d…` 全相同（72 487 字节）；三次不同运行（38183311644、38183626171、38184406784）共 12 次独立进程仍相同。Ubuntu、Windows 自身一致但与 macOS 不同。边界：只测了一张很小的静态页，无动画、阴影、毛玻璃、`backdrop-filter`；用的是 Playwright 自带的 Chromium 153，不是 Electron 44 的 Chromium 152；本机 Mac 的结果与 CI 不同，基准图必须在 `macos-26` 生成 | §13 “留一点容差”仍合理 |
| 17 | Playwright 对 Electron 44 | 可用 | Playwright 1.63.0 + Electron 44.4.5（electron 44.4.5、chrome 152.0.7977.130、node 24.21.0、v8 15.2.124.28）：`_electron.launch` 在三系统都成功（Ubuntu 用 `xvfb-run` 加 `--no-sandbox`），`firstWindow()`、截图、`evaluate` 正常，各 1 次。官方仍标“实验性” | §8.1 可补实测 |
| 18 | Playwright 找到并截图 `WebContentsView` | 能，不需要退路 | 一个 `BrowserWindow` 加一个 `WebContentsView`：`windows()` 和 `context().pages()` 直接列出视图页面，`locator` 读到文字，`screenshot()` 成功（macOS 9 872 字节、Ubuntu 5 243、Windows 8 433），`evaluate` 取得 640×320。退路 `view.webContents.capturePage()` 也可用。各 1 次 | K7 里“Playwright 能否操作预览视图”视为已知可行 |
| 19 | Claude Code 钩子字段名 | 已证实 | 仓库 `hook-input.ts` 的注释加官方文档（hooks 与 hooks-guide）核对：`session_id`、`transcript_path`、`cwd`、`permission_mode`、`hook_event_name`；PreToolUse 的 `tool_name`、`tool_input.command`；PostToolUse 的 `tool_input.file_path`；Stop 的 `stop_hook_active`（连续阻止 8 次后 Claude Code 会覆盖钩子）；设置里 `command` + `args`（不经 shell）、`timeout`（秒）、`matcher`、`${CLAUDE_PROJECT_DIR}` | “权限规则里的路径在 Windows 上的写法”仍未核实 |
| 20 | SessionStart 输出怎样进入上下文 | 已证实（官方文档） | 纯文本标准输出作为 Claude 能看到的上下文；也可输出 JSON `hookSpecificOutput.additionalContext`；退出码 2 只给用户看 stderr。`session-start.ts` 打印警告并退出 0，符合 | §9.2 的【未核实】改为已核实 |
| 21 | 子智能体“跳过项目说明”字段名 | 已证实（官方文档） | frontmatter 字段 `omitClaudeMd`，`true` 时不加载用户、项目、本地的 CLAUDE.md（托管策略文件仍加载），需 Claude Code 2.1.271 以上；内置 Explore 和 Plan 默认就跳过；同一页说明 AGENTS.md 一并跳过。`agents-config` 查的就是该字段 | 派 Explore、Plan 干活的交代里也要写“先读 AGENTS.md” |
| 22 | 让 `AGENTS.md` 静默失效的情形 | 两个已证实，另发现第三个 | 官方 memory 文档：`AGENTS.md` 只在工作目录及上级目录没有 `CLAUDE.md`、.claude/CLAUDE.md、`CLAUDE.local.md` 时才读（`CLAUDE.local.md` 算数；`~/.claude/CLAUDE.md` 和 .claude/rules/ 不算）；设置 `claude-md-and-agents-md` 两种都读；读 AGENTS.md 需 v2.1.277。第三个情形（文档“When AGENTS.md support is unavailable”）：版本低于 v2.1.277、用 `/plugin` 关掉读 `AGENTS.md` 的内置插件、升级后的第一次会话、v2.1.281 之前的 Bedrock 或关闭遥测的会话，只读 `CLAUDE.md` | §9.2 补第三个情形；对策见下面“第三个情形” |

## 二、附录 B 里指向 K15 的其他条目（11 项）

| # | 条目 | 判定 | 证据 | 后果 |
| --- | --- | --- | --- | --- |
| B1 | Dependabot 对公共仓库免费、支持 `pnpm-lock.yaml` | 已证实 | 仓库为公共（`visibility: public`）；提醒 #1：`source-map-js` GHSA-68fv-2mgg-jv7q（高危），`manifest_path: pnpm-lock.yaml`，2026-10-11T17:49:11Z 创建。只测了根锁文件，嵌套锁文件没有对应提醒 | 嵌套锁文件是否被扫描没有证据 |
| B2 | OSV-Scanner 按严重度过滤 | 没有 | `scan source --help`（2.6.0）全部选项里无 severity、cvss、fail-on、min；只能按公告 ID 用 `[[IgnoredVulns]]`；输出有 CVSS 数值可自行解析 | 与“不用它做闸门”一致 |
| B3 | OSV-Scanner 对两段式锁文件静默漏扫 | 不漏 | `pnpm add --config` 生成真正的两段式锁文件（环境锁 `configDependencies`，`---` 分隔符 2 个；`packageManager` 字段本身不产生两段）：单段、两段、目录递归三种扫描都找到 `braces@3.0.3` 的 GHSA-vfj7-8cjw-p6xm，退出码 1。官方可复用工作流（与每晚任务同一固定哈希）在 CI 扫了根 `pnpm-lock.yaml`（90 个包）和嵌套锁文件，报告 `source-map-js 1.2.1  GHSA-68fv-2mgg-jv7q  CVSS 8.7`（38183626171）。仓库自己的锁文件目前都是单段 | 附录 B 对应项关闭 |
| B4 | `pnpm audit` 退出码 | 1 | 带 `braces@3.0.3` 的锁文件：`--audit-level high` 退出码 1；`critical` 退出码 0（输出仍列 1 条高危）；无公告 0；`--json` 有高危时 1；注册表连不上：不加 `--ignore-registry-errors` 为 1，加了为 0，两种都先重试约 70 秒；有高危且加了该选项仍是 1。`pnpm audit signatures`（已装的 zod）退出码 0 | `audit-gate` 只看 JSON 的做法保留；PR 任务 10 分钟超时够用 |
| B5 | `--audit-level` / `audit.level` | 命令行有效 | high、critical 两档试过；`audit.level` 配置项没试 | 无 |
| B6 | Renovate 安全 PR 与最小发布年龄冲突 | 部分验证 | pnpm 一侧见 #4。Renovate 一侧（它的安全更新绕过它自己的年龄规则）是其文档的说法，没在本仓库运行过 | 待第一个 Renovate 安全 PR；安全 PR 的 CI 红灯是预期的，处理人加例外条目 |
| B7 | `overrides` 把 Nuxt 的 simple-git 升到 4.x | 待 M1 | Nuxt 模板还不存在 | 无 |
| B8 | Go 1.21 起按 `go.mod` 自动下载工具链 | 成立 | ubuntu-latest 自带 Go 1.24.13（`GOTOOLCHAIN=auto` 默认）。`go.mod` 写 `go 1.27.2` 后 `go run .`：第一次输出 `go: downloading go1.27.2 (linux/amd64)`，耗时 9 秒（另一轮 8 秒），第二次 ≤ 1 秒（缓存 `GOMODCACHE`，253 MB）；`GOTOOLCHAIN=local` 报 `go: go.mod requires go >= 1.27.2 (running go 1.24.13; GOTOOLCHAIN=local)`，退出码 1（38183804323、38184406784，各 1 次；Windows、macOS 没测） | 本机 Go 旧不会失败，会静默联网下载、多约 9 秒、占约 253 MB；界面要区分“本机够新”和“靠自动下载” |
| B9 | zod 生成 JSON Schema 的接口 | `z.toJSONSchema()` | zod 4.6.5：输出 JSON Schema 2020-12（`$schema`、`type`、`properties`、`required`、`additionalProperties: false`，`int` 带 ±9007199254740991） | 不需要 `zod-to-json-schema` |
| B10 | Electron 44 内置 Node 版本 | 24.21.0 | 三台 CI 上 Playwright 读 `process.versions`：node 24.21.0、chrome 152.0.7977.130、electron 44.4.5；K1 同值 | §8.1 官方时间表的 24.18.1 作废，Chromium 152 已实测 |
| B11 | 已知智能体的环境变量名 | 只观察了 Claude Code | Claude Code 2.1.296 子智能体会话：`CLAUDECODE=1`、`AI_AGENT=claude-code_2-1-296_agent`、`CLAUDE_CODE_ENTRYPOINT=cli`。Codex、Cursor、Gemini CLI 未安装，未验证 | Claude Code 写 `CLAUDECODE`；`AI_AGENT` 是跨工具约定名 |

## 三、顺带确认的小项（7 项）

| # | 条目 | 判定 | 证据 | 后果 |
| --- | --- | --- | --- | --- |
| C1 | 端口连接数采样看热更新长连接 | 能看到 | 数 `127.0.0.1:端口` 的 ESTABLISHED 连接（macOS/Linux `lsof -nP -iTCP:端口 -sTCP:ESTABLISHED`，Windows `netstat -ano -p TCP`）。真实 Vite 7.3.6：无连接 0 → Node `WebSocket`（子协议 `vite-hmr`）连上后 2 → 关闭后 0；四处一致（Windows 上这次没取到 token，连接仍建立并数到 2）。短 HTTP 请求（`Connection: close`）采样不到。边界：用 Node 的 WebSocket 代替真浏览器；浏览器自己的 keep-alive 连接也会被数进去（空闲 keep-alive 让计数停在 2 到 4） | “有连接”不等于“有活动”，只当“有页面连着”的信号；活动仍以日志和请求数为准 |
| C2 | pnpm 无终端时的确认提示 | 不卡住，会报错 | 触发“清空 node_modules 重装”（装好后打开 `shamefullyHoist` 再装）：无终端无 CI → 立即失败 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，退出码 1；`CI=true` → 自动同意（0）；`--config.confirmModulesPurge=false` → 成功；环境变量 `npm_config_confirm_modules_purge=false` 无效。四处一致（38184406784）。GitHub 机器上 pnpm 还靠 `GITHUB_ACTIONS` 认出 CI，实验里一并清空才测到“无 CI”。`nodeLinker`、`virtualStoreDir`、`modulesDir` 在 pnpm 11 不弹确认 | 管理进程调 `pnpm install` 不设 `CI=1`；遇到该错误码当作可处理的“需要重装”，带 `--config.confirmModulesPurge=false` 重试 |
| C3 | TS 语法检查接口 | `node --check` 不能用 | `node --check ok.ts`（合法 TS）也报 `SyntaxError: Missing initializer in const declaration`（Node 24.21.0 与 22.18.0）。`require("node:module").stripTypeScriptTypes(code)` 两个版本都有：合法代码返回剥完类型的文本；`enum` → `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`；语法错 → `ERR_INVALID_TYPESCRIPT_SYNTAX`；24.21.0 打 `ExperimentalWarning`；`process.features.typescript` 为 `"strip"`。三系统一致 | 脚本语法检查用 `stripTypeScriptTypes`（捕获并忽略实验警告） |
| C4 | `localhost` 与 `127.0.0.1` | 有差别 | `dns.lookup("localhost", {all: true})` 四处都是 `["::1", "127.0.0.1"]`。Node 24 `fetch`：服务只绑 `127.0.0.1` 时 `http://localhost` 成功（≤ 8 ms），只绑 `::1` 时也成功；`http://127.0.0.1` 访问只绑 `::1` 的服务 `ECONNREFUSED`，`http://[::1]` 访问只绑 `127.0.0.1` 的服务 `ECONNREFUSED`；绑 `::` 双栈都通。Chromium 没单独测 | 用服务实际绑定的主机字面量（`--host 127.0.0.1`），不混用；浏览器侧留 K7 |
| C5 | 系统是否提供 URL scheme 的发起方 | 待 M2 | 需要注册了协议的应用。方法：在 `app.on("open-url")`（macOS）和 `second-instance` 的 `commandLine`（Windows）打印全部参数，看有无发起进程或来源页 | 设计现状不变（来源只是链接里自称的 `source=`） |
| C6 | `setup.errors` 的错误字样 | 待 M1（Windows 部分待 K10） | 需要真实模板的真实失败输出。本次见到 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`、`ERR_PNPM_IGNORED_BUILDS`、`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 的真实文字 | 三个 pnpm 错误码加入 §4.4 `errors` 表（按错误码匹配比按英文句子稳） |
| C7 | Node 禁止直接执行 `.cmd` | 已测（`windows-2025`，1 次） | Node 24.21.0：`spawnSync("pnpm", ["-v"])` 不经 shell → `ENOENT`；`spawnSync("pnpm.cmd", ["-v"])` → `EINVAL`（Node 为防命令注入拒绝直接执行 `.cmd`/`.bat`）；`shell: true` 成功；`cmd.exe /d /s /c "pnpm -v"` 成功 | Windows 上起 `pnpm` 必须经 `cmd.exe /d /s /c`（参数含用户输入时自己转义，不用 `shell: true` 拼字符串）；与日志验证（0008）一致 |

合计 22 + 11 + 7 = 40 项。

## 要保留的两条 GritQL 规则

Biome 2.5.14 的 GritQL 插件，放在 tooling/biome/，用 `biome.json` 的 `plugins` 引用，范围由所在 `overrides[].includes` 限定。

规则一，`native-attr-literal.grit`（原生元素上的 `aria-label`、`title`、`placeholder`、`alt` 不许写字符串字面量；组件由 `Localized` 类型管）。Grit 的正则整串匹配，所以写 `r"[a-z].*"`：

```grit
JsxAttribute(name=$n, initializer=JsxAttributeInitializerClause(value=$v)) as $attr where {
  $n <: or { "aria-label", "title", "placeholder", "alt" },
  $v <: or {
    JsxString(),
    JsxExpressionAttributeValue(expression=JsStringLiteralExpression()),
    JsxExpressionAttributeValue(expression=JsTemplateExpression())
  },
  $attr <: within or { JsxSelfClosingElement(name=$tag), JsxOpeningElement(name=$tag) },
  $tag <: r"[a-z].*",
  register_diagnostic(
    span=$attr,
    message="原生元素上的 aria-label、title、placeholder、alt 不许写字符串字面量，文字走文案包的 t()（技术设计 §6.8 第 2 层）。",
    severity="error"
  )
}
```

规则二，`jsx-child-literal.grit`（JSX 子节点里的字符串字面量表达式：`{"文字"}`、`` {`模板`} ``、`{c ? "是" : t("x")}`、`{a || "默认"}`；用它补 `noStrings: false` 漏掉的部分）：

```grit
JsxExpressionChild(expression=$e) as $c where {
  $e <: or {
    JsStringLiteralExpression(),
    JsTemplateExpression(),
    JsConditionalExpression(consequent=JsStringLiteralExpression()),
    JsConditionalExpression(alternate=JsStringLiteralExpression()),
    JsLogicalExpression(right=JsStringLiteralExpression())
  },
  register_diagnostic(span=$c, message="JSX 里不许直接写字符串字面量，文字走 t()。", severity="error")
}
```

## 与规则配套的 Biome 配置

验证用的 `overrides`（`biome.json` 允许注释，下面的片段是配置的有效部分）：

```jsonc
{
  "overrides": [
    {
      // 第 1 层：JSX 文字。范围：renderer 和 ui 包，不含测试
      "includes": ["apps/desktop/src/renderer/**", "packages/ui/src/**", "!**/*.test.tsx"],
      "linter": { "rules": { "style": { "noJsxLiterals": {
        "level": "error",
        "options": { "noStrings": false, "ignoreProps": true, "allowedStrings": ["·", "›", ":"] }
      } } } },
      "plugins": ["./rules/native-attr-literal.grit", "./rules/jsx-child-literal.grit"]
    },
    { "includes": ["packages/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error",
        "options": { "paths": { "electron": "electron 只许出现在 apps/desktop 里" } } } } } } },
    { "includes": ["packages/ui/src/base/**"],
      "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error",
        "options": { "patterns": [{ "group": ["../features/**"], "message": "基础组件不许导入功能模块" }] } } } } } },
    { "includes": ["packages/protocol/**"],
      "linter": { "rules": { "correctness": { "noNodejsModules": "error" } } } }
  ]
}
```

注意第 2、3 个 override 都命中 packages/ui/src/base/** 里的文件：第 3 个的 `options` 整体替换第 2 个，`electron` 的限制在这个目录里消失。正确写法是在第 3 个里同时重写 `paths` 和 `patterns`。`noStrings: false` 下 `ignoreProps` 无关紧要；`allowedStrings` 放行纯符号的用法验证有效。

## 第三个情形：Claude Code 版本过低

版本低于 v2.1.277 的 Claude Code 只读 `CLAUDE.md`，读不到 `AGENTS.md`。`no-claude-md` 检查看不出这一点（仓库里没有违规文件）；钩子的输入里也没有版本号。唯一能做的是尽力而为：会话开始的钩子（`tooling/hooks/session-start.ts`，判断在 `claude-code-version.ts`，带测试）读环境变量 `AI_AGENT`，K15 在 Claude Code 2.1.296 的子智能体会话里看到它的值是 `claude-code_2-1-296_agent`；版本低于 2.1.277 就警告。其他版本是否也设这个变量没有验证，读不出就不提醒。其余几种（关掉内置插件、升级后第一次会话、v2.1.281 之前的 Bedrock 或关闭遥测会话）无法机械检查，是已知缺口。已有的缓解：决策记录 0004 要求 Claude Code 2.1.285 以上（覆盖版本过低）；根 `AGENTS.md` 第一屏写最关键的规则；`pnpm check` 和 CI 不管说明有没有被读到都照样拦着。已在决策记录 0004 记录。

## 没有验证的

- release-please 作为 GitHub Action 或命令行在真实仓库开发版 PR、合并后打标签（待 M5 第一次发版前，或 M1 结束时空跑一次，对照 20 个场景核对版本号）。
- 两条 Grit 规则放进真实的 `ui` 包后跑通 `pnpm lint`（M2 第一个界面 PR）；基准图第一次生成时再核对字体名断言（用 `CSS.getPlatformFontsForNode`，名字同时接受 `PingFang SC` 和 `蘋方-簡`）。
- 在 Nuxt、Next 模板的树上再试 `trustPolicy`；`overrides` 升级 simple-git（M1）。
- 真实的 `setup.errors` 字样（M1，Windows 部分 K10）；`runyard://` 发起方信息（M2）；Renovate 第一个安全 PR；嵌套目录的 Dependabot 提醒（有模板锁文件时）。
- 需要负责人的 Windows 真机：Claude Code 权限规则（`.claude/settings.json` 里 `Edit(/docs/product/**)` 这类路径）在 Windows 上怎么写，GitHub 的 Windows 机器没有装 Claude Code。
- 安装过的依赖已查：biome 2.5.14、release-please 17.11.2（162 个间接依赖没逐个查，只在临时目录运行）、playwright 1.63.0、electron 44.4.5、vite 7.3.6（自带 GHSA-rq7h-c2jc-7f22 中、GHSA-9jrq-w75r-8gcw 低，间接依赖 `source-map-js@1.2.1` 有高危 GHSA-68fv-2mgg-jv7q，所以没有提交锁文件）、zod 4.6.5、esbuild 0.25.12、braces 3.0.3（故意装的带高危公告的包，只生成锁文件）、is-number 7.0.0、osv-scanner v2.6.0 二进制（核对了 SHA-256，未核对 SLSA 来源证明）。
