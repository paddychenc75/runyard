# @runyard/ui

## 用途

界面的通用组件包：基础组件、图标、玻璃材质、组件工作台（技术设计 §6.7）。它不认识产品：不导入 `protocol`、`electron`、Node 接口（`src/` 里 Biome 的 `noNodejsModules` 拦），文件名、导出名、标识符里不出现产品词，不自己取数据。
现状：骨架加组件 `Icon`、`Button`、`ButtonGroup`、`GlassSurface`、`UserText`，主窗口外壳用到的 `IconButton`、`Tooltip`、`ScrollArea`、`Menu`（#171，包 Base UI 的菜单，数据驱动：`entries` 加 `onSelect`；开合经 `onOpenChange` 通知，外壳靠它让原生预览让位），资源库列表用到的 `StatusMark`、`Badge`、`MonogramTile`、`Truncate`、`EmptyState`（基础层），以及 `NavList`、`TitleBar`、`TabStrip`、`DataTable`、`LogView`、`ConfirmDialog`（组合层，在 `src/patterns/`），`AlertDialog`、`Checkbox`（基础层，#174 的关闭确认用），`Dialog`、`Field`、`TextField`、`Switch`、`SegmentedControl`（基础层，#173 的新建弹窗用；设计稿里自动清理天数是分段选择，所以没有做 `Select`），`Banner`、`CopyableCommand`、`StepList`（基础层，#178 的失败画面用）；其余组件随第一个用到它的功能 PR 加（§6.7 规则 8），不提前做。截图比对（`ui-visual`，`visual/`）已就位；`Localized` 属性的 React 绑定随 #164。六项组件化检查（`ui-layers`、`ui-purity`、`style-tokens`、`ui-fixtures`、`icons`、`file-size`）已在 `pnpm check` 里（#165），下面的规则就是它们守的。

## 对外暴露什么

只从 `src/index.ts` 导出：组件及其属性类型、`IconName`、样例文件的类型（`FixtureMeta` `FixtureSample` `SampleData`）。应用要引入样式：`@runyard/tokens/tokens.css`，再引入 `@runyard/ui/styles/reset.css`、`@runyard/ui/styles/base.css`（包的 `exports` 里登记的两个样式入口）（`materials.css` 由 `GlassSurface` 自己引入）。

## 本包特有的规则

- 可以导入：`@runyard/tokens`、`@runyard/i18n`（只用类型和 `ui`、`platform` 两组文案；依赖规则的唯一出处是 `tooling/checks/layers.json`）。第三方只用 React 和 `@base-ui/react`（行为和无障碍交给它，不手写）。
- 样式只用 `var(--…)` 语义变量加 CSS Modules：颜色、像素、圆角、字号、阴影、层级一律不写死；缺变量就改 `packages/tokens/src/tokens.json` 再 `pnpm tokens:build`。方向用逻辑属性（`padding-inline`，不用 `padding-left`）。
- `backdrop-filter` 只许写在 `src/styles/materials.css`；组件用 `<GlassSurface material="…">`。
- 一个组件一个文件夹，五个文件：`Name.tsx`、`Name.module.css`、`Name.fixture.tsx`、`Name.test.tsx`、`index.ts`；步骤见 `docs/guides/add-ui-component.md`。样例文件导出 `meta` 和 `samples`，样例里不写文字（走 `SampleData`），布局用 `src/fixtures/` 里的 `FixtureStack`、`FixtureBox`；新样例还要登记进 `workbench/registry.ts`。
- 变体用字符串联合，不用互斥布尔；`ref` 当普通属性收；`className` 是唯一的样式入口；文字属性的类型是 `Localized`（`children` 是 `ReactNode`）；纯图标按钮的 `label` 必填。 按钮三档 `sm` 28 / `md` 32（默认）/ `lg` 40，与变体无关，主按钮没有彩色阴影；并排的按钮必须放进 `ButtonGroup`，组里 `Button` 不写 `size`（`button-groups` 检查拦；`Dialog`、`AlertDialog`、`Banner` 的 `actions` 已自带组）。全文见 `docs/design/visual-system.md` 第 12 节。
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
- `src/icons/`：`svg/` 是图标源文件（只许 `<path>`，颜色只许 `currentColor`），`generated/` 是生成的图标表，不手改。`logo-*.svg` 是第三方技术标志（实心字形，授权和品牌规范见根目录 `THIRD_PARTY_NOTICES.md`），只由 `MonogramTile` 的 `logo` 用，颜色来自设计变量 `color-brand-*`；加新的先查品牌规范
- `src/styles/`：`reset.css`、`base.css`、`materials.css`；`src/fixtures/`：样例文件的类型和布局小零件
- `visual/`：截图比对（Playwright 配置、`visual.spec.ts`、组合矩阵、溢出扫描、对照页和它的报告器、预算）和 `__screenshots__/` 基准图（CI 生成，归负责人，`.github/CODEOWNERS`）
- `build/`：图标表生成和样式规则测试（Node 脚本）；`workbench/`：工作台（`build.ts` 打包，`serve.ts` 开服务，`registry.ts` 登记样例，`sample-data.*.ts` 是各语言的示例文字）

## 测试

组件测试用 jsdom、Testing Library 和 user-event，`vitest.setup.ts` 负责每个测试后卸载。`build/style-rules.test.ts` 守住样式结构（`backdrop-filter` 只在一处、焦点环、减弱动态效果、降低透明度）；真实渲染的比对由 `ui-visual` 负责（`visual/*.spec.ts` 是 Playwright 的，不在 Vitest 里跑；`visual/*.test.ts` 是它周边的单元测试）。伪语言的工作台地址是 `?locale=en-XA`，页面上写死的文字和撑破宽度的元素都会让伪语言那一张失败。

## 外壳组件的约定（#168）

- `TabStrip`：没有 `closeLabel` 的标签不能关闭（没有关闭按钮，⌘W 和 Delete 不起作用），资源库标签就这样用；键盘是手动激活的 Tabs（方向键只移动焦点）。方案 A（2026-10-18）：没有外壳，标签直接在窗口底色上，选中只有一块浅填充（`--glass-tab-selected-bg`，没有阴影和圈）；传 `overflowLabel` 就启用折叠（`fit-tabs.ts`）：放不下先把 `shrinkToIcon` 的标签缩成图标，再把后面的折进“+N”菜单，选中的始终留在条上；折掉的标签仍在 DOM 里（`inert`、不可见）用来量宽度。`add` 是标签条末尾的“＋”。第 2 档材质（toolbar、sidebar、filetree）只有填充和一层柔和阴影，没有描边（`materials.css`）。关闭快捷键监听整个文档，按键盘上的 `modKey` 区分 ⌘ 和 Ctrl，主进程菜单接管应用级快捷键之前靠它。
- `TitleBar`：`controls` 说明窗口按钮在哪一侧，那一头按设计变量 `size-window-controls` 留空；组件自己不判断系统。
- 样例数据 `SampleData` 的 `label`、`items` 等是 `Localized`（工作台里标记），用户内容用 `userText` 加 `<UserText>`。 `ListPicker` 的 `rail` 是左侧分类栏（#369）：只跳转和指示当前分组、不过滤；栏里按钮不进 Tab 顺序、按下不取焦点；`footer` 可以是拿高亮行 id 的函数。

## 表格组件的约定（#169）

- `DataTable`：`editingId` 标出行内编辑的行（行高随内容、淡强调底加边），`cellSpan(row, 列 id)` 让某一格向右占几列（最多 4，被占的列不画）；列用档位（`fill`、`flex`、`icon`、`sm`、`md`、`lg`、`xl`）说宽度，档位对应设计变量 `size-column-*`；`pin: "start" | "end"` 的列在窗口变窄、整张表横向滚动时固定在两侧。放不下时根元素带 `data-overflowing`，单元格里带 `data-when-overflowing` 的元素只在这时显示（名称列里补的状态圆点）。用的是真正的 `<table>`，版面靠 CSS 网格。
- `StatusMark` 的形状随状态变（实心圆、空心圆、圆圈叉），不只靠颜色；`Badge` 的 `violet` 变体是“来源”标记，`dashed` 比 `solid` 更轻。

## 日志视图的约定（#176）

- `LogView`：一行一条、不折行（行高固定，才能虚拟滚动：只有视口内加上下余量的行在 DOM 里；没量出行高时最多画最后 200 行），用户在底部时新行到来就跟到底部，往上翻看就不打扰。行文字是进程自己的输出，用 `UserText` 显示、不翻译；`tone`（`command`、`notice`、`error`）只决定颜色。区域是 `role="log"` 且可聚焦（键盘用方向键翻看）。

## 弹窗组件的约定（#174）

- `AlertDialog`：Base UI 的警示对话框，遮罩加 `GlassSurface material="dialog"` 面板，Escape 和点遮罩只请求关闭（`onOpenChange(false)`），不执行任何确认；`initialFocus` 让破坏性的确认框先聚焦“取消”。`container` 把弹窗挂到别处，样例用 `FixtureStage`（带 transform 的舞台，`position: fixed` 以它为参照）并排放几个打开着的弹窗。
- `ConfirmDialog`（`AlertDialog` 加图标块、可选勾选项、取消和确认两个按钮；`tone="danger"` 时图标块和确认钮用红色，给“移到废纸篓”，确认钮是已有的 destructive 浅红底，设计稿的实心红待 #320 的视觉规范）：`onConfirm(optedOut)` 把勾选状态在点确认时交出去，`onCancel` 不带勾选；每次重新打开勾选项回到未勾选。
- `Checkbox`：名字用 `<label htmlFor>` 关联 Base UI 的隐藏 input，`hint` 作为描述。

## 失败画面用的组件（#178）

- `Banner`：带图标块的提示卡（`tone` 是 `warning` 或 `danger`，淡色底），标题加说明，`children` 放详情、`actions` 放按钮；是 `role="status"`。预览区上方的端口说明用它。
- `CopyableCommand`：一行等宽命令框（`user-select: all`，点三下全选），只显示、从不执行；“复制命令”按钮由调用方放在旁边并接剪贴板。
- `StepList`：步骤横排，每步的标记形状随状态变（完成对勾、当前转圈、失败红色圆圈叉、未到空心圆），当前步骤带 `aria-current="step"`。
- 图标新增 `warning`、`refresh`、`exclamation`。

## 选择器组件的约定（#172）

- `ListPicker`：分组的 listbox，焦点留在 `renderHeader` 交出的搜索框里（combobox 加 `aria-activedescendant`），上下方向键、Home、End 移动高亮，回车选择高亮行，点击一行也选择；输入法组词时（`isComposing`）按键不处理。高亮按“第几行”记，同一项可以出现在两个分组里（“最近使用”和它的类型）。不过滤：过滤由使用处决定传进来的 `groups`。行前的徽标用 `MonogramTile`（`size="lg"`）。
- `SearchField`：放大镜加无框输入加末端提示，`ref` 指向输入框；`Kbd` 是键帽，文字由使用处给。三者都是现成的通用组件，别在功能里再造。

- 表单弹窗（#173）：`Dialog` 整块是一个 `form`，回车或 `type="submit"` 触发 `onSubmit`，输入法组词时的回车被拦掉；`TextField` 必须放在 `Field`（Base UI Field）里，有 `error` 时说明让位给错误；`SegmentedControl` 再点已选中的不取消；`MonogramTile` 新增 `xl`。新增设计变量取自 CreateDialog、CreateDialogOn、Empty：`size-switch-*`、`color-fill-switch-off`、`color-bg-field`、`color-bg-suggestion`、`color-line-field`、`color-line-card`、`shadow-field-focus`、`shadow-segment-selected`、`shadow-thumb`。
