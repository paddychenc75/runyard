---
name: verify
description: 验证当前改动：运行 pnpm verify，并按固定格式汇报每一项的结果。说“做完了”之前使用。
---

# 验证改动

1. 在仓库根目录运行 `pnpm verify`。每条命令跑什么见 `docs/guides/commands.md`。
2. 按这四项逐项汇报“通过”或“失败”，失败的贴出报错原文：`pnpm lint`、`pnpm typecheck`、`pnpm check`、受影响的包的测试。
3. 有失败就修，修完重新运行，直到全部通过。
4. 不许为了通过而放松检查、删测试或跳过测试；觉得某项检查本身有问题，停下来问用户。

没有运行过的命令不要说“通过”。
