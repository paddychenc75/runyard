---
name: archive-change
description: 实现和验证都完成后，把规格增量合并进主规格，清掉改动文件夹，写 PR 描述。开 PR 之前使用。
---

# 合并一次改动的规格

严格按 `docs/guides/change-with-spec.md` 的步骤 8 做，步骤只写在那份手册里，这里不重复。

要点：

1. 先运行 `pnpm verify`，全部通过才往下；已实现场景对应的行要从 `tooling/checks/spec-pending.txt` 里删掉。
2. `pnpm spec archive <改动名> --yes` 需要用户确认；只有主智能体做这一步，子智能体不做。
3. 合并后 `openspec` 目录下的 `changes` 里不能留这次的文件夹；把提案的“为什么”和“改什么”写进 PR 描述，重要的技术决定写决策记录。
