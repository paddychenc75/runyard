<!-- PR 标题格式：type(scope): 中文主题，例如 feat(core): 增加运行状态机。合并方式是 squash，标题会成为进入 main 的提交信息。 -->
<!-- English is welcome in descriptions; the title should still follow the format above. -->

## 改了什么、为什么

<!-- 写清楚改动内容和原因。相关的产品需求写上 PRD 文档里的锚点（docs/product/02-prd.md）。负责人做过的决定写上日期。 -->

## 怎么验证的

<!-- 贴出 `pnpm verify` 的结果，或者说明怎么手动验证。哪些没验证，直接写出来。 -->

## 与设计稿的差异

<!-- 改了界面才填：对照的画板名；并排截图（浅色/深色 × 中文/英文，窗口 1440 和 1100 宽）放在哪里；每一处剩余差异和原因。没改界面写“无界面改动”。 -->

## 改动范围

<!-- 贴合并前 `git diff --stat origin/main...HEAD` 的文件清单（太长就按目录计数），确认每个文件都是本任务有意改的。 -->

## 完成标准

- [ ] `pnpm verify` 本地通过，结果贴在上面；CI 在 macOS、Windows、Ubuntu 上全绿
- [ ] 新增的行为有测试；修缺陷先有一个能复现的失败测试
- [ ] 没有新增未说明的跳过或忽略，没有放宽检查或加长超时
- [ ] 改了界面：和设计稿并排对照过，“与设计稿的差异”逐条写了原因
- [ ] 读过完整的 `git diff --stat origin/main...HEAD`，没有意外的文件或删除
- [ ] 启动过应用的：用了临时 `HOME` 加 `--root`，`~/.runyard` 没有被改动
- [ ] PR 描述、提交信息和新增的代码注释用中文（英文说明欢迎，但标题的主题请用中文）
- [ ] 改了 `README.md` 的内容，同一个 PR 里也改了 `README.zh-CN.md`
- [ ] 新增或升级了依赖：按 `docs/architecture/dependencies.md` 的规则选了版本（精确版本、发布满 14 天），在该文件里加或改了一行，并贴出 `pnpm check` 和 `pnpm audit --prod --audit-level high` 的输出；用了安全修复例外的，写明公告编号
