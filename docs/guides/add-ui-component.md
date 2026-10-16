# 新增一个界面组件

规则的出处是技术设计 §6.7（组件化）；这份手册把它写成今天能照着做的步骤。通用组件在 `packages/ui`，细则见 `packages/ui/AGENTS.md`。

## 何时用

- 要在 `packages/ui` 里加一个基础组件或组合组件
- 要给现有组件加变体、状态或样例

组件只在第一个用到它的功能 PR 里出现（或紧挨在它前面的一个 PR），不提前做一整套（§6.7 规则 8）。

## 步骤

1. **先查有没有现成的。** 运行 `pnpm ui:dev` 看一遍工作台，或搜 `packages/ui/src`；能用现有组件加一个变体解决的，就加变体。
2. **定它在哪一层。** 通用的单个控件放 `src/primitives/`；通用的组合放 `src/patterns/`；带产品含义的属于功能模块，不在这个包。名字必须是通用词（`DataTable`，不是 `LibraryTable`），标识符里不出现产品词。
3. **找对应的画板。** 在 `docs/design/` 里找 `Spec*.dc.html`（控件、材质、状态、动效）和用到它的画面，列出画出来的每个变体和状态。画板之间不一致，或画板没画的变体，停下来问，不自己选。
4. **建文件夹，五个文件。** `Name.tsx`、`Name.module.css`、`Name.fixture.tsx`、`Name.test.tsx`、`index.ts`；文件夹和文件用大驼峰，不建 `utils.ts`、`helpers.ts`。交互行为先看 `@base-ui/react` 有没有对应组件，有就包它；没有再自己写，并按 W3C 的键盘规范写行为测试。
5. **样式只用语义变量。** `.module.css` 里只写 `var(--…)`：颜色、像素、圆角、字号、阴影、层级都不写死；方向用逻辑属性。缺变量，先在 `packages/tokens/src/tokens.json` 加，再 `pnpm tokens:build`。玻璃效果用 `<GlassSurface>`，`backdrop-filter` 只许在 `src/styles/materials.css`。
6. **写属性。** 变体用字符串联合，不用互斥布尔；布尔只给 `disabled` `loading` 这类独立开关；`ref` 当普通属性收；样式入口只有 `className`；文字属性类型用 `Localized`；纯图标按钮的 `label` 必填。
7. **写样例。** `Name.fixture.tsx` 导出 `meta` 和 `samples`：画板上画出的每个变体和状态各一个样例，另加一个“文字很长”的样例（`long-label`）；悬停、按下、聚焦用 `data-force-state` 强制显示。样例里不写文字，用参数里的 `SampleData`；布局用 `src/fixtures/` 的 `FixtureStack`、`FixtureBox`。把样例登记进 `workbench/registry.ts`。
8. **写测试。** 行为测试覆盖：键盘能到达和操作（`Tab`、`Enter`、空格）；浮层类的焦点进出；回调的参数。用 user-event，按“角色加名字”找元素。写错属性应是类型错误的，加一条带 `@ts-expect-error` 的类型测试（注释写 issue 编号）。
9. **从入口导出。** 在 `src/index.ts` 加导出。
10. **检查。** 在工作台里用 浅色、深色、中文、英文 各看一遍；用开发者工具的“渲染”面板模拟“降低透明度”和“减弱动态效果”再看一遍。运行 `pnpm verify`。

## 图标

- 源文件 `src/icons/svg/<名字>.svg`：名字小写加连字符；`viewBox` 只能是 `0 0 16 16` 或 `0 0 24 24`；只许 `<path>`（圆和线先转成路径）；颜色只许 `currentColor`（和 `none`），不许内联样式。
- 运行 `pnpm icons:build` 生成 `src/icons/generated/icon-paths.ts`，里面有 `IconName` 类型；使用时 `<Icon name="plus" size={16} />`，名字写错类型检查报错。
- 从 Lucide 取路径要在 `src/icons/CREDITS.md` 记一行（ISC 许可，允许）。

## 界面变了之后

基准图只在 CI 的 `macos-26` 机器上生成，本地不写基准图。新组件的样例文件登记进 `workbench/registry.ts` 后，`ui-visual` 会要求它的五张基准图；界面有变化的 PR 给它加标签 `update-ui-baseline`，由 CI 重新生成基准图，PR 描述写一句“界面变了什么、为什么”并贴对照页的链接。完整流程见 `docs/guides/ui-visual.md`。

## 验证

- `pnpm --filter @runyard/ui test` 通过；`pnpm verify` 通过。
- 工作台里能看到新组件的所有样例。
- 没有写死的颜色、像素、文字。

## 完成标准

- 一个文件夹五个文件齐全，从包入口导出。
- 样例覆盖画板上的每个变体和状态，另有“文字很长”的样例。
- 行为测试覆盖键盘可达、焦点可见、回调参数；动画的组件另测“减弱动态效果”。
- 文件不超过 400 行。
