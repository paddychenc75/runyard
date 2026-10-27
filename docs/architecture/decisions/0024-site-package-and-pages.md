# 0024. 官网放在 apps/site，用 Astro 静态站发布到 GitHub Pages

状态：已接受

日期：2026-10-27

来源：#563（负责人 2026-10-26 回复“都按推荐”）；技术设计 §3.2

## 背景

官网要放在本仓库里，用 Astro 生成静态页，通过 GitHub Pages 发布在 `paddychenc75.github.io/runyard`。它和桌面应用、命令行没有代码上的关系，但需要一个工作区包和自己的发布流程。

## 决定

- 新增工作区包 `@runyard/site`（`apps/site`），在 `tooling/checks/layers.json` 登记为不可导入任何 `@runyard/*` 包，也没有包导入它。
- Astro 7.3.8 只作为构建时的开发依赖（`devDependencies`），页面不带运行时、不装集成、不用 UI 框架、不用远程字体和统计；页面不发任何第三方请求。
- `astro.config.mjs` 设 `base: "/runyard"`、`trailingSlash: "always"`；中文在 `/`，英文在 `/en/`，深浅色用 `prefers-color-scheme`。
- 发布工作流 `.github/workflows/site.yml` 只有 `workflow_dispatch`，动作按提交号固定，默认只读，只有部署任务要 `pages: write` 和 `id-token: write`。启用 Pages 和第一次部署由负责人决定。

## 后果

多一个包和一个开发依赖（Astro 及其间接依赖，经 `pnpm audit --prod` 不可见；间接依赖 undici 的高危公告在修复版满 15 天前保留，见 `docs/architecture/dependencies.md`）。官网文字和下载链接要随版本手动更新。

## 被否的方案

- 把官网放进 `docs/`：会混进给开发者看的文档，也没有自己的构建。
- 用 Starlight 或别的主题：依赖多，首屏动画和设计稿要的是自己的版面。
- 推送到 main 就自动部署：负责人还没看过，先只允许手动。
