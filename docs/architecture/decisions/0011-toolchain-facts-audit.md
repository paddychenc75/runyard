# 0011. 工具链的几处细节按实测核对，并修正技术设计

状态：已接受

日期：2026-10-12

来源：技术设计 §3.3、§6.8、§8.1、§8.4、§8.6、§9.2、§11.1 的 K15；证据 [evidence/0011-toolchain-facts-audit.md](../evidence/0011-toolchain-facts-audit.md)

## 背景

技术设计里有一长串“用记忆写的、没验证过”的工具链细节（Biome、pnpm 11、Node 直接运行 `.ts`、release-please、OSV-Scanner、Claude Code 钩子、截图等），附录 B 也有若干条指向它。K15 把它们拆成 40 项逐项核对：22 项在 K15 一行里，11 项来自附录 B，7 项是顺带确认的小项。环境：负责人的 Mac、`macos-26`、`ubuntu-latest`、`windows-2025`（服务器版，不是 Windows 11）。证据见上面的链接，含 40 项的表、运行号和 PR #6。

## 决定

没有一项推翻已接受的决策；技术设计按核对结果改写。改变设计的有六处：

1. §6.8 第 1 层用 `noJsxLiterals`，`noStrings: false`（原配置的 `noStrings: true` 会误伤每个 `t("key")`）；表达式里的字面量和原生元素上的 `aria-label`、`title`、`placeholder`、`alt` 由两条已验证的 GritQL 规则拦，规则全文写入技术设计和证据。
2. `minimumReleaseAgeExcludePrune` 清掉的是锁文件不再使用的版本，与年龄无关；例外条目满 14 天后要手动删。
3. 锁文件里有不满 14 天的版本而没有例外条目，`pnpm install --frozen-lockfile` 失败；例外条目必须和锁文件在同一个 PR。
4. `osv-scanner.toml` 的键是 `[[IgnoredVulns]]`（写成 `IgnoreVulns` 会退出码 127）。
5. `trustPolicy: no-downgrade` 保持关闭：对真实的约 900 个包的依赖树会拦下 `semver@6.3.1`、`@octokit/endpoint@9.0.6`。
6. 同一条 Biome 规则被多个 `overrides` 命中同一文件时，后一个整体替换前一个，不合并。

另有两条规则：release-please 会整个忽略标题里用全角冒号（`：`）的提交，PR 标题检查必须拒绝；脚本语法检查用 `module.stripTypeScriptTypes`，不用 `node --check`。

## 后果

- 其余 34 项（Node 24 直接运行 `.ts` 的写法约束、`allowBuilds`、Playwright 对 Electron 44 与预览视图、`macos-26` 苹方与逐像素一致、钩子字段等）的结论写入技术设计对应章节，【未核实】标记改为引用本记录。
- 导致 `AGENTS.md` 静默失效的情形有三个：目录里有 `CLAUDE.md` 或 `CLAUDE.local.md`；子智能体设了“跳过项目说明”；Claude Code 低于 2.1.277（以及关掉内置插件、升级后第一次会话、2.1.281 之前的 Bedrock 或关闭遥测会话）只读 `CLAUDE.md`。前两个有检查；第三个没有可靠的机械检查，只有会话开始钩子读 `AI_AGENT` 里的版本号的尽力而为提醒，其余是已知缺口；见 0004。
- 仍未验证：release-please 在真实仓库开发版 PR（M5 前）；Renovate 的安全 PR 与年龄规则的冲突（第一个安全 PR 时）；Nuxt 模板树上的 `trustPolicy` 与 simple-git 升级（M1）；Windows 真机上 Claude Code 权限规则的路径写法。
- 只在 `windows-2025` 服务器版上测过的 Windows 结论只是近似。

## 被否的方案

- 照抄 §6.8 原来的 `noStrings: true` 配置：误伤每一个 `t("key")` 调用。
- 现在就启用 `trustPolicy: no-downgrade`：会拦下正常的旧版本补丁；将来要开须同时设 `trustPolicyIgnoreAfter: 129600`。
- 用 `node --check` 做 TypeScript 语法检查：它按 JavaScript 解析，合法的 `.ts` 也报错。
