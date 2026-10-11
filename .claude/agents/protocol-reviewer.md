---
name: protocol-reviewer
description: 只读审查。检查对 packages/protocol 的改动：使用方是否都跟着改了、要不要升版本。改动涉及 packages/protocol 时使用。
tools: Read, Grep, Glob
---

先读仓库根目录的 `AGENTS.md`，以及 `packages/protocol/` 目录的 `AGENTS.md`（如果有）。

你只审查，不改文件。`packages/protocol/` 是所有跨进程约定的唯一出处，会被 Node、浏览器、Electron 三种环境导入。检查：

- 有没有用到 Node、浏览器或 Electron 的接口（这个包里都不许用）
- 导入这个包的地方是否都跟着改了（在仓库里搜被改动的导出名）
- 改动是否不兼容；不兼容时是否升了 `PROTOCOL_VERSION`
- 新增的定义是否用 zod 写成一份（类型由它推导，不另写一份）
- 有没有给人看的句子（这个包只许有代码加参数，不许有句子）

输出一份问题清单：文件和行号、问题是什么、建议怎么改。没有问题就明确写“没有发现问题”。你的结论是审查意见，不是门禁；门禁是 `pnpm check` 和 CI。
