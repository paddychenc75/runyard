# @runyard/site（官网）

## 用途

Runyard 的官网（#563）：Astro 生成的静态页，之后发布到 GitHub Pages，地址 `paddychenc75.github.io/runyard`（所以 `astro.config.mjs` 里 `base` 是 `/runyard`）。中文在 `/`，英文在 `/en/`；深浅色只跟随系统（CSS 的 `prefers-color-scheme`），没有主题开关。设计稿是 `Site*.dc.html` 画板、首屏动画规则与可播放原型，在 PR #564（分支 `design/site-563`）里，合并后放在 `docs/design/` 下。不认识产品代码，不导入任何 `@runyard/*` 包。

## 对外暴露什么

不是库。在仓库根目录运行：

```sh
pnpm site:preview   # 构建并在 http://127.0.0.1:4321/runyard/ 预览（等同 pnpm --filter @runyard/site preview）
pnpm site:dev       # 开发服务器，同一地址
pnpm --filter @runyard/site build   # 产物在 apps/site/dist
```

## 本包特有的规则

- 不联网：不用远程字体、统计、CDN、图片服务，页面不发任何第三方请求（页面里的链接只在用户点击时才离开本站）。不装集成，不用 UI 框架；Astro 是只在构建时用的开发依赖。
- 页面文字在 `src/copy/zh.json` 和 `en.json`，两份结构一致，改一边同步改另一边；下载链接和版本在 `src/copy.ts` 的 `links`，发新版时一起改。只发 Apple 芯片（arm64），没有 Intel 链接。最低系统写“macOS 13 及以上”，来自 Electron 44 的破坏性变更说明（44 起不再支持 macOS 12）。
- 橙色只出现在首屏动画的执行线（`--brand-run-line`）和图标上，其余用蓝色和设计变量。颜色变量名与 `packages/tokens` 一致。
- 首屏动画 `src/scripts/hero.js` 照设计稿里的 `hero-prototype.html` 移植：一个时钟算出每一帧；减弱动态效果时停在最后一帧；舞台不在视野或标签页在后台时暂停；没有脚本时显示最后一帧。预览卡里的页面照 `templates/builtin/react19` 还原，模板改了要一起改。
- `public/shots/` 的截图是从真实应用截的（临时主目录、2x、浅深色 × 中英文），转成 webp，不是示意图；界面大改后要重截。没有演示视频，不放“看演示视频”按钮。
- 部署：`.github/workflows/site.yml` 只能手动触发，启用 Pages 由负责人决定。

## 子目录地图

- `src/pages/`：`index.astro`（中文）、`en/index.astro`（英文），都只是 `components/Page.astro` 加语言。
- `src/copy/`、`src/copy.ts`：文字和链接。`src/styles/`：样式，按概念分文件（base 变量与导航、hero、sections、footer、responsive）。`src/scripts/hero.js`：首屏动画。
- `public/`：`favicon.svg`、`shots/*.webp`。

## 测试

没有单元测试。验证靠构建加 Playwright 截图：构建后用本机静态服务器绑在 127.0.0.1，在 1440 和 390 宽、中英文、浅深色下整页截图，检查没有横向滚动、重叠、被裁的文字，并确认没有第三方请求。
