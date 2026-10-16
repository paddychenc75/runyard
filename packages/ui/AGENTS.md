# @runyard/ui

## 用途

界面的通用组件包：基础组件、图标、玻璃材质、组件工作台（技术设计 §6.7）。它不认识产品：不导入 `protocol`、`electron`、Node 接口（`src/` 里 Biome 的 `noNodejsModules` 拦），文件名、导出名、标识符里不出现产品词，不自己取数据。
现状：骨架加组件 `Icon`、`Button`、`GlassSurface`、`UserText`，主窗口外壳用到的 `IconButton`、`Tooltip`、`ScrollArea`，资源库列表用到的 `StatusMark`、`Badge`、`MonogramTile`、`Truncate`、`EmptyState`（基础层），以及 `NavList`、`TitleBar`、`TabStrip`、`DataTable`（组合层，在 `src/patterns/`）；其余组件随第一个用到它的功能 PR 加（§6.7 规则 8），不提前做。截图比对（`ui-visual`，`visual/`）已就位；`Localized` 属性的 React 绑定随 #164。六项组件化检查（`ui-layers`、`ui-purity`、`style-tokens`、`ui-fixtures`、`icons`、`file-size`）已在 `pnpm check` 里（#165），下面的规则就是它们守的。

## 对外暴露什么

只从 `src/index.ts` 导出：组件及其属性类型、`IconName`、样例文件的类型（`FixtureMeta` `FixtureSample` `SampleData`）。应用要引入样式：`@runyard/tokens/tokens.css`，再引入 `@runyard/ui/styles/reset.css`、`@runyard/ui/styles/base.css`（包的 `exports` 里登记的两个样式入口）（`materials.css` 由 `GlassSurface` 自己引入）。

## 本包特有的规则

- 可以导入：`@runyard/tokens`、`@runyard/i18n`（只用类型和 `ui`、`platform` 两组文案；依赖规则的唯一出处是 `tooling/checks/layers.json`）。第三方只用 React 和 `@base-ui/react`（行为和无障碍交给它，不手写）。
- 样式只用 `var(--…)` 语义变量加 CSS Modules：颜色、像素、圆角、字号、阴影、层级一律不写死；缺变量就改 `packages/tokens/src/tokens.json` 再 `pnpm tokens:build`。方向用逻辑属性（`padding-inline`，不用 `padding-left`）。
- `backdrop-filter` 只许写在 `src/styles/materials.css`；组件用 `<GlassSurface material="…">`。
- 一个组件一个文件夹，五个文件：`Name.tsx`、`Name.module.css`、`Name.fixture.tsx`、`Name.test.tsx`、`index.ts`；步骤见 `docs/guides/add-ui-component.md`。样例文件导出 `meta` 和 `samples`，样例里不写文字（走 `SampleData`），布局用 `src/fixtures/` 里的 `FixtureStack`、`FixtureBox`；新样例还要登记进 `workbench/registry.ts`。
- 变体用字符串联合，不用互斥布尔；`ref` 当普通属性收；`className` 是唯一的样式入口；文字属性的类型是 `Localized`（`children` 是 `ReactNode`）；纯图标按钮的 `label` 必填。
- 悬停、按下、聚焦用 `data-force-state="hover|pressed|focus"` 在样例里强制显示。
- 基准图只由 CI 生成，给 PR 加 `update-ui-baseline` 标签，不要在本地更新（本地写基准图会直接报错）；单张不超过 200 KB、总量不超过 30 MB（`visual/budget.ts`）；流程和 1× 的实测依据见 `docs/guides/ui-visual.md`。
- 界面里不调 `usePlatform()`，快捷键用 `<Kbd shortcut="…">`（这两样随后续组件加入）。
- 测试优先按“角色加名字”找元素，找不到才用 `data-testid`。

## 检查怎么报错

- `ui-purity`：文件名、目录名和声明的名字按词匹配术语表“代码标识符”一列（`playground`、`template`、`supervisor`、`toolchain`、`runyard`、`library`、`run` 等）；`platform`、`tab`、`preview` 等本来就是通用控件词的，登记在 `tooling/checks/ui-purity.json`（每项写明理由）。
- `style-tokens`：`.css` 和 `.tsx` 里不许有十六进制颜色、`rgb()` 一类、颜色关键字、除 `0` 和 `1px` 外的像素、直接写数值的圆角 / 字号 / 字体 / 层级 / 阴影、基础级变量、左右方向属性、`style={{…}}` 里的颜色和尺寸；图片里的颜色放进图片文件（如工作台的 `backdrop-colorful.svg`）。
- `ui-fixtures`：`primitives/<名>/`、`patterns/<名>/` 必须有 `<名>.fixture.tsx` 并导出 `meta`、`samples`。基准图放 `visual/__screenshots__/`，文件名以组件名开头（`Button-light-zh-CN.png`）；这个目录建立之后每个样例文件都要有基准图。单张不超过 200 KB，总量不超过 30 MB。
- `icons`：图标源文件规格同 `build/icons.ts`，图标表必须是 `pnpm icons:build` 的最新输出。

## 命令

`pnpm ui:dev` 打开工作台；`pnpm ui:visual` 本地只比对截图（先 `pnpm --filter @runyard/ui visual:install`）；`pnpm icons:build` 生成图标表；`pnpm --filter @runyard/ui test` 跑测试。工作台用 esbuild 打包（没有装 Vite，原因见 `docs/architecture/dependencies.md` 的 vite 一行）。降低透明度、减弱动态效果两种系统设置在浏览器开发者工具的“渲染”面板里模拟。

## 子目录地图

- `src/primitives/`：基础组件；`src/patterns/`：组合组件（用基础组件拼成，如标签条）
- `src/icons/`：`svg/` 是图标源文件（只许 `<path>`，颜色只许 `currentColor`），`generated/` 是生成的图标表，不手改
- `src/styles/`：`reset.css`、`base.css`、`materials.css`；`src/fixtures/`：样例文件的类型和布局小零件
- `visual/`：截图比对（Playwright 配置、`visual.spec.ts`、组合矩阵、溢出扫描、对照页和它的报告器、预算）和 `__screenshots__/` 基准图（CI 生成，归负责人，`.github/CODEOWNERS`）
- `build/`：图标表生成和样式规则测试（Node 脚本）；`workbench/`：工作台（`build.ts` 打包，`serve.ts` 开服务，`registry.ts` 登记样例，`sample-data.*.ts` 是各语言的示例文字）

## 测试

组件测试用 jsdom、Testing Library 和 user-event，`vitest.setup.ts` 负责每个测试后卸载。`build/style-rules.test.ts` 守住样式结构（`backdrop-filter` 只在一处、焦点环、减弱动态效果、降低透明度）；真实渲染的比对由 `ui-visual` 负责（`visual/*.spec.ts` 是 Playwright 的，不在 Vitest 里跑；`visual/*.test.ts` 是它周边的单元测试）。伪语言的工作台地址是 `?locale=en-XA`，页面上写死的文字和撑破宽度的元素都会让伪语言那一张失败。

## 外壳组件的约定（#168）

- `TabStrip`：没有 `closeLabel` 的标签不能关闭（没有关闭按钮，⌘W 和 Delete 不起作用），资源库标签就这样用；键盘是手动激活的 Tabs（方向键只移动焦点）。关闭快捷键监听整个文档，按键盘上的 `modKey` 区分 ⌘ 和 Ctrl，主进程菜单接管应用级快捷键之前靠它。
- `TitleBar`：`controls` 说明窗口按钮在哪一侧，那一头按设计变量 `size-window-controls` 留空；组件自己不判断系统。
- 样例数据 `SampleData` 的 `label`、`items` 等是 `Localized`（工作台里标记），用户内容用 `userText` 加 `<UserText>`。

## 表格组件的约定（#169）

- `DataTable`：列用档位（`fill`、`flex`、`icon`、`sm`、`md`、`lg`、`xl`）说宽度，档位对应设计变量 `size-column-*`；`pin: "start" | "end"` 的列在窗口变窄、整张表横向滚动时固定在两侧。放不下时根元素带 `data-overflowing`，单元格里带 `data-when-overflowing` 的元素只在这时显示（名称列里补的状态圆点）。用的是真正的 `<table>`，版面靠 CSS 网格。
- `StatusMark` 的形状随状态变（实心圆、空心圆、方块），不只靠颜色；`Badge` 的 `violet` 变体是“来源”标记，`dashed` 比 `solid` 更轻。
