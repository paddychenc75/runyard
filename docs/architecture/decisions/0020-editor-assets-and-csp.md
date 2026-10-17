# 0020. 编辑器的本地加载方式，以及界面内容安全策略的最小放宽

状态：已接受

日期：2026-10-17

来源：PRD #prd-editor；技术设计 §6.2、§6.5、§12（K8）；规格 desktop/editor；负责人 2026-10-17 对 PR #245 问题 9、11 的回答（先补做 K8；Monaco 用 0.57.0）；负责人 2026-10-17 同意采用方案 A（只放开样式的 unsafe-inline，脚本仍严格）

## 背景

编辑器要用 Monaco 0.57.0，Vue 单文件组件靠 Shiki 4.4.3（JavaScript 正则引擎）着色，TS/JS 智能提示用 Monaco 自带的 TypeScript 后台线程；一律从 `app://runyard/` 加载，不走 CDN（技术设计 §6.5“界面不加载任何远程内容”）。现在界面的策略是 `default-src 'none'; script-src app://runyard; img-src data:; style-src app://runyard 'sha256-…'`。K8 在打包后的应用里逐项实测了需要放开什么，数据见[证据](../evidence/k8-editor-validation.md)。

## 决定

建议（待负责人接受）把策略改为：

`default-src 'none'; script-src app://runyard; img-src data:; font-src app://runyard; style-src app://runyard 'unsafe-inline'`

即两处改动，其余不动：

1. 加 `font-src app://runyard`：Monaco 的图标字体 `codicon.ttf` 由它的样式表引用，不加就被 `default-src 'none'` 拦下。
2. `style-src` 加 `'unsafe-inline'`，**同时去掉现有的 `sha256-…` 哈希**：Monaco 运行时插入 18 个 `<style>` 元素，行渲染还写了一千多个 `style="…"` 属性，值是动态的，哈希和随机数都管不了属性；有哈希时浏览器忽略 `'unsafe-inline'`（实测）。

实测不需要放开：`worker-src`（后台线程从 `script-src` 回退，基线下就能起）、`unsafe-eval`、`wasm-unsafe-eval`、`connect-src`、`blob:`。验证全程没有任何发往 `app://runyard/` 和 `data:` 以外的请求。

装法（后台线程独立文件、按需引入、Shiki 与 TSX、项目文件登记方式）记在证据文件“装法”一节，M3 的实现 issue 照做。

## 后果

- 放宽的实际含义：有人能往页面里注入标签时，可以注入样式。因为 `default-src 'none'`，样式既不能联网（`img-src` 只有 `data:`、`font-src` 只有本应用），也不能执行脚本；剩下的风险是界面被篡改的外观。脚本的限制（`script-src app://runyard`，无 `unsafe-eval`）不变。
- 实现 issue（#256）改 `index.html` 里的策略，并更新那里的注释；去掉 Base UI 滚动区的哈希；跑界面测试和视觉基准。
- 决策记录 0019 的“`style-src` 加哈希、不开 `unsafe-inline`”这条后果，在本记录被接受后不再成立（0019 的其余决定不变）。
- 本记录接受前，不改任何策略；验证页和依赖都不在仓库里（在不合并的分支 `spike/k8-editor-validation`）。
- 用到的依赖（monaco-editor 0.57.0、shiki 4.4.3、@shikijs/monaco 4.4.3）在 #256 里按 `docs/guides/add-a-dependency.md` 装并写进 `dependencies.md`。

## 被否的方案

- 字体内联进样式表、写 `font-src data:`：不新增本应用以外的来源，但 `data:` 比 `app://runyard` 宽，样式表从 175 KB 变 380 KB；没有好处。
- `style-src-elem` 用每次加载随机生成的随机数、`style-src-attr 'unsafe-inline'`（实测零违反）：比建议的方案少放开“注入 `<style>` 元素”这一项，但要主进程在返回 `index.html` 时每次生成并写入随机数，还要在 Monaco 载入前改写 `document.createElement` 给 `<style>` 加随机数。多出的机制换来的好处在 `default-src 'none'` 下很小；若负责人要更严，选这个。
- 只放开 `style-src-elem`、属性保持禁止：编辑器的行渲染全部错位（实测约 1400 次违反），不可用。
- 维持现状、高亮退回 Monaco 自带的：没有颜色、主题切不动（实测所有文字同色），与规格场景 37–39 矛盾。
- 用 CDN 版 Monaco：违反“不加载远程内容”，且无法离线。
