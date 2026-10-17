# 0019. 桌面应用登记可以导入 `@runyard/ui`

状态：已接受（界面样式的安全策略部分被 0020 取代）

日期：2026-10-17

来源：技术设计 §3.2（desktop：renderer 可导入 `tokens`、`ui`）；决策记录 0017、0018；M2 议题 #168；负责人 2026-10-17 同意

## 背景

决策记录 0017 写明桌面界面一侧按技术设计 §3.2 还能导入 `tokens`、`ui`，等 `ui` 出现时随它的决策记录扩；0018 登记了 `ui` 包并预告“桌面应用会在界面外壳之后登记”。#168 把界面换成 React 外壳，需要 `@runyard/ui` 的组件。

## 决定

1. `tooling/checks/layers.json` 里 `@runyard/desktop` 的允许列表加 `@runyard/ui`，与技术设计 §3.2 一致，没有新增导入方向。
2. 应用的 `package.json` 直接依赖 `react`、`react-dom`（版本取统一版本表，已在 `dependencies.md`），测试依赖 `jsdom` 与 Testing Library（同样是已记录的版本）。
3. `@runyard/ui` 的 `exports` 登记两个样式入口（`styles/reset.css`、`styles/base.css`），应用只从包的出口取样式，不伸进内部目录。

## 后果

- 主进程和预加载脚本仍不得使用 `ui`、React：由 Biome 的导入规则和界面单独的 `tsconfig.renderer.json` 约束。
- 界面的内容安全策略 `style-src` 加一个哈希，放行 Base UI 滚动区插入的固定 `<style>`，不开 `unsafe-inline`。
- 改 `layers.json` 原本要负责人先点头，本记录在负责人确认之前保持“提议中”。

## 被否的方案

- 把组件复制进应用：违背 0018 的独立组件包和工作台。
- CSP 开 `unsafe-inline`：放宽了安全策略，哈希足够。
