# 0017. 桌面应用登记进依赖规则，layers 检查覆盖 apps/

状态：提议中

日期：2026-10-16

来源：技术设计 §3.2、§3.3；决策记录 0012

## 背景

技术设计 §3.2 的依赖表里本来就有桌面应用（desktop：main、preload、renderer），但 `tooling/checks/layers.json` 只登记了 `packages/` 下的包，`layers` 检查也只扫 `packages/`。最早的桌面外壳（#200）进仓库后，`apps/desktop` 需要一个能被检查的依赖边界，否则它可以随意导入任何包。改 `layers.json` 要附决策记录（`AGENTS.md`、`docs/guides/write-an-adr.md`）。

## 决定

1. `layers.json` 登记 `@runyard/desktop`（路径 `apps/desktop`），允许导入 `@runyard/protocol`、`@runyard/platform`、`@runyard/client`、`@runyard/i18n`，即 §3.2 表中 desktop：main 一行去掉尚未存在的 `tokens`；`tokens` 包建好后再加，同样需要改 `layers.json`。
2. `layers` 检查的范围从 `packages/` 扩到 `apps/`：应用的 `package.json` 依赖必须与 `layers.json` 一致，类型引用同理。
3. 应用内部的细分（main、preload、renderer 各自能导入什么）不进 `layers.json`，由 Biome 的 `noRestrictedImports`、`noNodejsModules` 和界面单独的 tsconfig 约束（§3.3）。这样 `layers.json` 仍然只描述包与包之间的方向。

## 后果

- `electron` 仍只许出现在 `apps/desktop`（§3.2 规则 1）；`core`、`supervisor` 不在 desktop 的允许名单里，桌面应用只经 `client` 与管理进程通话。
- 新增 `apps/` 下的应用（如网站）也要先登记 `layers.json`，否则 `layers` 检查报错。
- desktop 的允许名单与 §3.2 表有一处暂时的差异（缺 `tokens`）；`tokens` 合并后补上。

## 被否的方案

- 不登记，靠 Biome 单独把关：Biome 只管导入语句，管不到 `package.json` 里声明的依赖和类型引用，与其他包的强制方式不一致。
- 把 main、preload、renderer 拆成三个条目写进 `layers.json`：它们是同一个包里的目录，不是包，`layers.json` 只读 JSON、不解析源码（§3.3），拆开做不到。
