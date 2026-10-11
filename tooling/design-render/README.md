# 设计稿本地渲染

把 `docs/design/*.dc.html`（设计组件页面）在本地展开成静态 HTML，用本机 Chrome 无头模式截图，供评审查看。`docs/design/` 只读，这里不会改动它。

## 目录
- `render.mjs`：渲染脚本（Node，无第三方依赖）
- `build/`：展开后的静态 HTML（每个板子一个，无脚本）
- `png/<板名>.png`：每个板子的截图，2 倍清晰度（尺寸为 `w*2 × h*2`，来自 `canvas.json`）
- `sheets/<page>.png`：各画布页（zh、zhDark、en、enDark、spec、specEn）的总览图，缩略图宽 720px，标题在下方，顺序同 `canvas.json` 的 `order`

## 重新运行
```
cd tooling/design-render
node render.mjs              # 全部：展开 + 截图 + 联系表
node render.mjs Main Picker  # 只渲染指定板子（不生成联系表）
node render.mjs --no-shots   # 只展开 HTML
```
需要 macOS、Node 18+、`/Applications/Google Chrome.app`，以及系统自带的 `sips`（用于校验或裁剪尺寸）。

## 已知限制
这是真实画布运行时（`support.js`）的本地近似，不保证逐像素一致。
- 模板只支持 `{{a.b}}` 点路径取值，不支持表达式；`this.props` 取 `data-props` 里的 `default`，`this.state` 为空。
- 事件、悬停、动画和滚动都不会生效；所有板子按静态首帧渲染。
- Logo 三个板子里的图片地址是运行时的 `/_blob/<hash>`，本地没有，本地没有这些图片时，对应位置留空。
- 2 倍截图时窗口必须与板子尺寸完全一致，否则内容会整体偏移。
- 板子清单以运行时的 `canvas.json` 为准；设计目录有改动后请重新运行。

## 输出不进仓库
`build/`、`png/`、`sheets/` 都是生成物，已写进 `.gitignore`，随时可以重新生成。
