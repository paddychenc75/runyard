# 第三方声明（Third-party notices）

本文件登记仓库里随源码分发的第三方素材。依赖包（npm）的版本和理由在 `docs/architecture/dependencies.md`；这里只记**拷进仓库的素材**及其授权。

## 技术标志（模板徽标）

- 来源：Simple Icons，<https://github.com/simple-icons/simple-icons>，npm 包 `simple-icons` **16.33.0**（2026-09-27 发布，取查询日满 14 天的最新版；16.35.0、16.34.0 不满 14 天）。只拷了下面三个字形，**没有**把包装进依赖。
- 许可：CC0 1.0 通用（Creative Commons Zero），全文见包内 `LICENSE.md`（2026-10-17 核对）。CC0 只放弃图标图形本身的版权；**商标权不在其内**（该文件第 4 条第 1 款：“No trademark or patent rights held by Affirmer are waived”），Simple Icons 的 `DISCLAIMER.md` 也要求使用者自行遵守各品牌的使用规范。
- 用法（对所有标志一致）：只用来**标明**模板对应的技术，不暗示背书或关联；图形不改（只去掉 `<title>`、`role`，用 `currentColor` 着色）；颜色用该品牌自己的官方色（深色主题用官方的浅一档，见 `packages/tokens/src/tokens.json` 的 `color-brand-*`）。
- 文件：`packages/ui/src/icons/svg/logo-html5.svg`、`logo-vue.svg`、`logo-python.svg`，由 `pnpm icons:build` 生成 `icon-paths.ts`。

| 标志 | 对应模板 | Simple Icons 文件 | 品牌方规范 | 结论 |
| --- | --- | --- | --- | --- |
| HTML5 | `html` | `html5.svg` | W3C HTML5 标志常见问题：标志、图标和网站采用 CC BY 3.0，可改颜色和大小，要求署名 W3C；<https://www.w3.org/html/logo/faq.html> | 使用。署名：HTML5 logo © W3C（<https://www.w3.org/>），CC BY 3.0 |
| Vue | `vue3` | `vuedotjs.svg` | vuejs/art：CC BY-NC-SA 4.0 加额外条件，开源或非营利的 Vue 相关项目、教学内容、说明商业产品的 Vue 集成可用；商业产品里用于别的目的需要书面同意；<https://github.com/vuejs/art>。标志由 Evan You 设计 | 使用。仅用于标明 Vue 模板；该文件按 CC BY-NC-SA 4.0 署名 Evan You，不把它用于别的目的 |
| Python | `python` | `python.svg` | PSF 商标政策：用未改动的标志说明“用 Python 语言编写/涉及 Python”无需批准，商业与非商业都可；不许改动或遮挡图形形状；<https://www.python.org/psf/trademarks/> | 使用。只改了颜色（单色品牌蓝），没改形状；政策没有专门谈应用界面，如 PSF 认为单色算改动，就退回缩写 |

### 没有使用标志、保留缩写方块的模板

| 模板 | 标志 | 原因 |
| --- | --- | --- |
| `react19`、`react18` | React | Meta 开源商标政策（<https://opensource.fb.com/legal/trademark/>）：指称性使用只覆盖名称，“the name may be used, but not the stylized wording or the logo”；用标志需 opensource@fb.com 书面许可 |
| `go` | Go | Go 品牌规范（<https://go.dev/brand>）：标志被修改、用在商业产品标志里、或紧挨其他标志/徽标使用，都需先经审核；单色重画属于“修改”，选择器里又与其他标志并排 |
| `node-ts` | Node.js / TypeScript | Node.js：OpenJS 商标政策（<https://trademark-policy.openjsf.org/>）要求用项目提供的官方版本、标志“不得有颜色变化”，Simple Icons 是重画的单色版；TypeScript：微软商标页（<https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks>）写明未经许可不得使用其标志（文字名称可指称使用） |
| `hono` | Hono | 官方仓库代码是 MIT，但标志文件没有写明单独的使用许可，不能当作已授权 |

要补上这些标志，需先向品牌方取得书面许可（或确认其规范允许），再把字形加进 `packages/ui/src/icons/svg/`、在 `logoOf`（`apps/desktop/src/renderer/library-view.ts`）登记，并更新本文件。
