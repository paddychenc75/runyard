---
name: write-adr
description: 写一份架构决策记录（ADR）。改了包结构、依赖规则、磁盘格式、构建或发布做法，或推翻以前的决定时使用。
---

# 写决策记录

严格按 `docs/guides/write-an-adr.md` 的步骤做，步骤只写在那份手册里，这里不重复。

开始前先做两件事：

1. 列出 `docs/architecture/decisions/` 里已有的记录，下一个编号是最大编号加一。
2. 找到这个决定的出处：PRD 的锚点，或技术设计的章节。找不到出处就停下来问用户。

写完运行 `pnpm check`，`adr-index` 一项要通过。
