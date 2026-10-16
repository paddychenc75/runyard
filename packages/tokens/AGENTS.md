# @runyard/tokens

## 用途

设计变量的唯一出处（技术设计 §6.7）：颜色、玻璃材质、阴影、圆角、尺寸、间距、字号、动效、层级。`src/tokens.json` 是源，`pnpm tokens:build`（或 `pnpm generate`）生成三样，并重写 `docs/design/tokens.md` 两个标记之间的表。设计稿和 `tokens.json` 不一致时以 `tokens.json` 为准。
现状：只有变量本身和生成脚本；没有组件（通用组件包由 #163 建），`prefers-contrast: more` 的覆盖值设计稿没画，还没有。

## 对外暴露什么

`exports` 有两项：`.`（`src/index.ts`）和 `./tokens.css`（`generated/tokens.css`，应用和网站都引入）。
- `themes.light|dark`：随主题变的变量（颜色、阴影）的最终值，没有 CSS 变量引用。
- `constants`、`numbers`：两个主题下相同的变量，前者带单位的字符串，后者能当数字用的（像素、毫秒、字重、层级）。
- `windowBackground`：主进程建窗口前设 `backgroundColor` 用，避免启动闪白。
- `monacoThemes`、`shikiThemes`、`xtermThemes`：Monaco、Shiki、xterm 不认 CSS 变量，要真实色值。
- 类型 `TokenName`、`ThemedTokenName`、`ConstantTokenName`、`NumericTokenName`（不带 `--`）。

## 本包特有的规则

- 可以导入：无（依赖规则的唯一出处是 `tooling/checks/layers.json`）。`src/` 不用 Node、浏览器接口；读写文件的代码只在 `build/`。
- 第三方依赖：没有（只有测试用的 `vitest`、`@types/node`）。
- `generated/` 下的文件和 `docs/design/tokens.md` 的生成段不手改；改了 `tokens.json` 必须重新生成并一起提交，否则 `generated-fresh` 变红。
- 变量分两级：基础级（`--blue-600`，`tokens.json` 的 `base`）只出现在 `tokens.css`，不进 TS，组件不许用；语义级（`--color-text-primary`、`--radius-card`、`--space-4`、`--glass-toolbar-bg`）才是对外的。语义名的前缀只能是 `color-` `glass-` `shadow-` `radius-` `space-` `size-` `font-` `text-` `motion-` `z-`，校验在 `build/model.ts`。
- 浅色深色：颜色写成 `light-dark(浅色, 深色)`，一个变量里两个值；`:root` 声明 `color-scheme: light dark`，`data-theme="light|dark"` 强制，不写就跟随系统。`light-dark()` 只收颜色，所以阴影（整段值）在 `:root` 写浅色，深色写在 `[data-theme="dark"]` 和“跟随系统且不是强制浅色”两处。实测记录见 `docs/architecture/evidence/tokens-light-dark-electron.md`。
- 每个颜色必须是单个值：`#RRGGBB`、`rgba(r, g, b, a)` 或 `{基础名}`，范围值（设计稿里“0.06 到 0.08”）会被校验拒绝。
- 玻璃背景可以带 `opaque`（降低透明度时的不透明底色），生成到 `@media (prefers-reduced-transparency: reduce)`；没有加 `backdrop-filter` 的规则，那是以后通用组件包的 `materials.css` 的事。
- 生成物的排版要和 Biome 的格式化结果一致（`pnpm lint` 也检查它们）：CSS 里十六进制小写、数字不带多余的 0（所以 `tokens.json` 里写 `0.1` 不写 `0.10`）、多层阴影按 Biome 的方式折行；TS 里放不下 100 列的值挪到下一行。改生成代码后先 `pnpm tokens:build` 再 `pnpm lint`。
- 加变量：先在 `tokens.json` 加（颜色放进 `themed` 的合适分组并写 light 和 dark，其他放 `scales`），再生成；组件缺变量就改这里，不在组件里写死。

## 子目录地图

- `src/tokens.json`：唯一来源；`src/index.ts`：唯一入口（再导出 `generated/`）
- `generated/`：生成物（`tokens.css`、`tokens.ts`、`editor-themes.ts`）
- `build/`：生成脚本。`build.ts` 入口，`model.ts` 读取与校验，`render-css.ts` `render-ts.ts` `render-editor.ts` `render-doc.ts` 各生成一样，`resolved.ts` 把基础级引用换成原始值，`color.ts` 颜色写法转换，`quote.ts` 字符串字面量写法

## 测试

`pnpm --filter @runyard/tokens test`。`build/*.test.ts` 测校验、颜色转换、三种生成物的内容、可重复，以及“提交的生成物和现在生成的一致”；`src/exports.test.ts` 测对外的值。没有起真进程的测试。`light-dark()` 在 Electron 里的可用性是手工实测，记录在 `docs/architecture/evidence/`，不进 CI。
