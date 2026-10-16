# 0018. 新增 `@runyard/ui` 包，依赖规则登记

状态：已接受

日期：2026-10-16

来源：技术设计 §3.2（`@runyard/ui` 一行）、§6.7；M2 议题 #163；负责人 2026-10-17 同意

## 背景

技术设计 §3.2 规定 `@runyard/ui` 只许导入 `tokens` 和 `i18n`，第三方只用 React 和 `@base-ui/react`；§6.7 规定它是不认识产品的通用组件包，带组件工作台。M2 开头的第一个界面 PR（#163）要建这个包，`layers.json` 里还没有它，`layers` 检查会拒绝没登记的包。

## 决定

1. `tooling/checks/layers.json` 登记 `@runyard/ui`（路径 `packages/ui`，允许 `@runyard/tokens`、`@runyard/i18n`），与技术设计 §3.2 一致，没有放宽或新增任何导入方向。
2. 包内的第三方依赖按 §8.6 选定并登记在 `docs/architecture/dependencies.md`：运行时 `react`、`react-dom`、`@base-ui/react`；只在测试里用的 `jsdom`、`@testing-library/react`、`@testing-library/dom`、`@testing-library/user-event`。
3. 组件工作台用已有的 esbuild 打包，不用 Vite：满足 §8.6 的无公告 Vite 版本要到 2026-10-20 之后才有，而工作台只需要一个静态页。以后装了 Vite，只改 `workbench/build.ts`。
4. `src/` 里不许用 Node 模块，由 Biome 的 `noNodejsModules`（`biome.json`）强制；`build/` 和 `workbench/` 里的脚本和测试可以用。

## 后果

- 依赖规则由 `layers` 检查强制：`ui` 导入 `protocol`、`platform`、`electron` 等会失败；别的包要用 `ui`，需要先改 `layers.json`（桌面应用会在 #167 之后登记）。
- 共用 Vitest 配置的单元测试范围扩到 `*.test.tsx`，隔离名单的路径不再用 `new URL`（jsdom 环境里全局 `URL` 不是 Node 的，`fileURLToPath` 不认）。
- 改 `layers.json` 原本要负责人先点头，本记录在负责人确认之前保持“提议中”。

## 被否的方案

- 把组件放进 `apps/desktop/src/renderer/`：通用组件要被工作台和截图流水线独立使用，且技术设计已定为独立包。
- 现在就装 Vite 并加年龄例外：不绕过年龄规则；2026-10-20 起 7.3.7 满 14 天，不需要例外。
- 用 Storybook 等现成工作台：技术设计 §6.7 已否（太重，零新依赖的目标）。
