# K8 的证据：打包后的应用里，本地 Monaco、Shiki 的 Vue 着色和 TS 智能提示能否工作

对应技术设计 §6.2、§6.5、§11.1 的 K8，issue #252，规格 `openspec/specs/desktop/editor/spec.md`（PR #245），决策记录 [0020](../decisions/0020-editor-assets-and-csp.md)。本文自成一体：验证用的代码是一次性的，放在**不合并的分支** `spike/k8-editor-validation`（目录 `spike-k8/`），这里保留做法、数字、结论、装法和没有验证的部分。

## 做法

环境：Apple M3 Max，macOS 27.0.1，Electron 44.5.1，基于 `main` 的 `3104901`（#237 的打包已合并；#241 还没合并，所以打包出来的应用没有随带管理进程，启动时报“找不到管理进程”，与编辑器无关）。

1. 依赖装在仓库**之外**的临时目录，没有改动仓库的任何 `package.json`、锁文件或 `dependencies.md`：`monaco-editor@0.57.0`、`shiki@4.4.3`、`@shikijs/monaco@4.4.3`（精确版本）。版本和公告以 PR #245 的调研为准，开工当天用 `pnpm deps:lookup` 复查：三者均无 A、B 公告，C（项目公告页）为空数组。
2. 用仓库自己的 `esbuild` 把一个验证页打成 `main.js`/`main.css`（IIFE，与现有界面的构建方式一致），五个后台线程各打成单独文件放在 `workers/` 下，字体文件由 esbuild 以文件形式输出；全部由 `app://runyard/` 提供，没有任何网络地址。
3. 正常构建一次 `apps/desktop`，用验证页的文件覆盖 `dist/renderer/`（`dist` 不进 git），再用仓库的 `pack.ts --dir --e2e` 打成 `.app`；另外用不带 `--e2e` 的正式开关再打一份，结果一致（见“范围”）。
4. 启动打包后的 `Runyard.app`（`HOME` 指向新建的临时目录，`--root` 在其中；结束后核对 `~/.runyard` 的修改时间没有变化），加 `--remote-debugging-port` 用 DevTools 协议驱动：导航到不同的页面变体，读页面里的结果对象，记录“违反内容安全策略”的事件、全部网络请求和控制台错误。启动的进程按进程号加启动时间核对后结束。
5. 页面里的验证项：11 种语言的着色、Vue 三段、主题切换、TS 的补全/跳转/类型错误/改名/悬停、屏蔽误报、他处文件改动后的提示、Vue 无补全、查找替换、多光标、换行符、4.9 MB 大文件、500 个文件的项目、1 万行滚动、中文界面文字。

## 内容安全策略：逐项实测

基线是现在的策略：`default-src 'none'; script-src app://runyard; img-src data:; style-src app://runyard 'sha256-…'`。每个变体打开同一个验证页，数“违反策略”的事件。

| 变体 | 在基线上的改动 | 违反策略 | 编辑器是否正常 |
| --- | --- | --- | --- |
| 基线 | 无 | 字体 1，`<style>` 元素 18，`style` 属性 1479 | 否：所有文字同色，主题切不动（背景透明） |
| v1 | + `worker-src app://runyard` | 同基线 | 否；**说明基线下后台线程已经能起来**（`worker-src` 回退到 `script-src`），不需要这一项 |
| v2 | + `font-src app://runyard` | `<style>` 元素 18，`style` 属性 1479 | 否 |
| v3 | + `font-src app://runyard`，`style-src` 换成 `'unsafe-inline'`（去掉哈希） | **0** | 是 |
| v4 | `font-src data:`（字体内联进样式表）+ `'unsafe-inline'` | 0 | 是；样式表 175 KB 变 380 KB |
| v5 | `style-src` 用随机数（nonce）代替 | `style` 属性 1396 | 否：元素通过了，属性不行 |
| v6、v7 | 只给 `style-src-elem` 加 `'unsafe-inline'` | `style` 属性约 1400 | 否 |
| v8 | `style-src-elem` 用随机数 + `style-src-attr 'unsafe-inline'` + `font-src` | 0 | 是（需要给 Monaco 的 `<style>` 元素加随机数，见 0020） |
| v9 | `'unsafe-inline'` 和哈希**同时**写 | `<style>` 元素 18，属性 1489 | 否：写了哈希，浏览器就忽略 `'unsafe-inline'` |

结论：

- **必须放开两项**：`font-src app://runyard`（Monaco 的图标字体 `codicon.ttf`，在 CSS 里引用）；样式的内联许可（Monaco 运行时插入 18 个 `<style>` 元素，且它的行渲染用 HTML 字符串，每行带 `style="top:…;height:…"` 属性，一次验证 1000 多次）。
- **不需要**：`worker-src`、`script-src` 的 `unsafe-eval`、`wasm-unsafe-eval`（JavaScript 正则引擎）、`connect-src`、`blob:`；`img-src data:` 已经覆盖 Monaco 的 SVG 波浪线（`data:image/svg+xml`）。
- 样式属性这一项**无法避免**：随机数和哈希都管不到属性（哈希要 `'unsafe-hashes'` 且值是动态的）；Monaco 没有随机数入口（包里搜不到 `nonce` 的使用，除了内置的 DOMPurify）。
- 现有的 `sha256-…` 哈希要去掉：它和 `'unsafe-inline'` 同时存在时，浏览器忽略后者（v9 实测）。

## 范围与结论：按规格场景族

可行性：**是** 做到了并有数据；**是（有条件）** 做到了但要照“装法”处理；**否/部分** 需要回给负责人；**不涉及** 这些场景与 Monaco 无关（主进程文件服务、文件树、界面），K8 不验证。

| 场景 | 内容 | 结果 |
| --- | --- | --- |
| 01–03、05–08、10–14 | 文件树、新建、重命名文件夹、废纸篓 | 不涉及 |
| 04 | 创建后 150 ms 内看到编辑器 | **有风险**：冷加载 Monaco（5.3 MB 脚本）到编辑器可用，从导航起算 280–293 ms；Shiki 初始化 20 ms。必须在应用启动后空闲时预加载，不能等到打开第一个文件时才加载；预加载后的耗时没有测，仍由 #15 的手动测量把关 |
| 09 | 重命名有未保存修改的文件 | **是（有条件）**：Monaco 的模型地址不能改，新建同内容的模型接管，未保存的修改保留（实测 `let y = 1;`）；旧模型要及时销毁 |
| 15–20、23–29、31–36 | 文件标签、自动保存、外部修改 | 不涉及（主进程与界面逻辑）；Monaco 只提供内容、未保存标记所需的版本号和 `onDidChangeContent`，未专门测 |
| 21 | 非文本文件 | 不涉及 |
| 22 | 5 MB 以上不着色 | **是（有条件）**：4.9 MB 的 TS 文件建模型 14 ms，首屏着色 100 ms，TS 语法检查 0.43 s、补全 0.17 s；但整份文件按顺序着色要 8.1 s（JS 正则引擎，100 KB 0.22 s、500 KB 0.9 s、1 MB 1.8 s、2 MB 3.5 s），跳到文件末尾要等约 9 s 才有颜色。是否把 5 MB 降低，由负责人定（见下） |
| 30 | 原样保留换行符 | **部分**：全 LF、全 CRLF、无结尾换行的文件原样往返；**LF 与 CRLF 混用的文件会被统一成 CRLF，`getValue()` 与原文不一致**。BOM 也被去掉（应用要自己记住并写回）。混用换行符的处理要回给负责人 |
| 37 | 11 种语言有高亮 | **是**：TS、TSX、JS、JSX、Vue、CSS、HTML、JSON、Markdown、Python、Go 都不是单色（每种 3–7 种颜色）。JS 正则引擎用严格模式（`forgiving: false`，遇到不能翻译的正则就报错）加载了 24 个语法（含 Vue 内嵌的），一个都没报错 |
| 38 | Vue 三段分别着色 | **是**：模板的标签 `button`（`entity.name.tag.html`）、属性 `class`、字符串；脚本的 `import`/`const`（`keyword.control.import.ts`、`storage.type.ts`）、类型 `number`；样式的属性名 `color`（`support.type.property-name.css`）、颜色值、选择器。颜色各不相同 |
| 39 | 主题跟随应用 | **是**：`setTheme` 5 ms 内背景由白变深，光标位置与模型不变 |
| 40–42 | 补全、跳转、类型错误 | **是**：`addT` 补出 `addTwo`，带签名；跳转到另一个文件的定义（要注册编辑器打开器，标准编辑器自己不切换模型）；`const bad: number = "a"` 出 2322，悬停显示“Type 'string' is not assignable to type 'number'”；改名能找到三处引用（含另一个文件） |
| 43 | 屏蔽找不到模块的误报 | **是（有条件）**：把诊断码 2307、2792、7016、7026、2875 加入 `diagnosticCodesToIgnore` 后，`import … from "react"` 的 `.tsx` 没有相关错误。7026/2875 是 JSX 在没有 React 类型时的连带误报，实测才出现；别的缺类型情况可能还有别的码，实现时要拿真实项目再过一遍 |
| 44 | 别的文件改了，提示跟着变 | **是（有条件）**：Monaco 只在**本文件**内容变化时重新检查，另一个文件改名后 4 秒内 `App.tsx` 没有出现错误。自己调用线程的 `getSemanticDiagnostics` 再 `setModelMarkers`，6–15 ms 就出现 2305 |
| 45 | 不联网 | **是**：全程只有 `app://runyard/…` 和 `data:` 的请求，没有任何别的地址；TS 线程自带标准库，不下载类型 |
| 46 | Vue 没有误报和补全 | **是（有条件）**：语言 id 为 `vue` 时没有任何错误标记；默认会弹出“基于文档单词”的补全（实测弹出 `doubled`），要关 `wordBasedSuggestions`；关掉后手动触发（`⌃Space`）仍会弹出写着“No suggestions.”的小窗，只能接受或另想办法 |
| 47–51 | 实时结果 | 不涉及 |
| 52–53 | 查找替换、多光标 | **是**：以命令方式验证——`addSelectionToNextFindMatch` 两次得到 3 个光标，输入后 3 处同时改；查找控件“全部替换”换掉 3 处。快捷键本身（`⌘F`、`⌥⌘F`、`⌘D`）是 Monaco 的 macOS 默认绑定，**没有用真实按键验证** |

技术设计 §11.1 对 K8 的其他判定：

| 判定 | 结果 |
| --- | --- |
| 后台线程全部起得来 | 是：编辑器、TS、CSS、HTML、JSON 五个都从 `app://runyard/workers/` 加载成功，基线策略下也能起 |
| 补全 300 ms 内出现 | 是：第一次调用（含启动线程）215–260 ms，之后中位数 3 ms、最大 17 ms |
| 500 个文件的项目 | **按“每个文件一个模型”做不到**：第一次补全等了 26–32 s（模型创建本身 33–45 ms；关掉内置的检查也一样，说明慢在线程同步）。**把没打开的文件登记成 extra lib、只给打开的文件建模型**：第一次补全 254 ms，之后中位数 4 ms，一个文件改动后到下一次补全 109 ms。见“装法” |
| 1 万行文件滚动不卡 | 是：240 步滚动，帧间隔中位数 8.6 ms、p95 9.6 ms、最大 38 ms |
| `.vue` 有高亮 | 是 |
| 本地化 | 部分：0.57.0 的 `esm/vs/nls/lang/` 有 `zh-cn.js` 等 13 种语言；在载入 Monaco **之前**载入它，查找框、操作名全部变中文（实测“查找”“区分大小写 (⌥⌘C)”“重命名符号”“命令面板”）。运行中切换语言**没有验证**，且很多文字在模块载入时就取好了，预期要重新加载界面。剩余英文的完整清单**没有做**（只核对了查找框和五个操作名） |

## 数字

| 项 | 数值 |
| --- | --- |
| `main.js`（Monaco 核心约 4.0 MB、Shiki 的 24 个语法约 1.0 MB、Shiki 核心与主题约 0.1 MB、语言服务客户端约 0.08 MB） | 5.35 MB，gzip 1.25 MB |
| `main.css` + 字体文件 | 175 KB + 153 KB |
| 后台线程：TS / CSS / HTML / JSON / 编辑器 | 7.04 / 1.08 / 0.76 / 0.44 / 0.31 MB（只要着色和 TS 智能提示，CSS/HTML/JSON 三个线程可以不要，省 2.3 MB） |
| 合计 | 约 15.3 MB（不要三个线程是 13.0 MB）；`app.asar` 从 2.8 MB 变 16.9 MB（含验证页替换掉的现有界面 1.7 MB）；`.app` 目录 306 MB 变 323 MB |
| 4.9 MB 文件：建模型 / 首屏着色 / 整份着色 / 跳到末尾出颜色 | 14 ms / 100 ms / 8.1 s / 9.0 s |
| Shiki 初始化（11 种语言，JS 引擎） | 20 ms |
| 他处文件改动后用自己的检查出提示 | 6–15 ms；用 `setDiagnosticsOptions` 触发 Monaco 重检查要 305 ms（会重启线程） |

## 装法（M3 正式实现要照做）

1. **导入路径**：`monaco-editor` 的 `exports` 把 `./*.js` 映射到 `esm/vs/*.js`，所以写 `monaco-editor/editor/editor.api.js`（不是 `monaco-editor/esm/vs/…`）；`.css` 文件不在映射里，要用相对路径指到 `node_modules/monaco-editor/esm/vs/…` 下。
2. **按需引入，不用 `editor.main.js`**：它会把 80 多种语言的定义全部带上。验证里的 `monaco-features.ts` 是从 `editor.main.js` 机械地筛出来的：保留 `editor/contrib/**` 和 `editor/browser/**` 的功能文件、`codicon.css` 与 `codicon-modifiers.css`，语言只留 typescript、javascript、css、html、json、markdown、python、go、scss 的定义。**升级 Monaco 时要对照新版 `editor.main.js` 重新生成这份清单。**
3. **TS 接口**不在 `monaco.languages.typescript` 上（那是 `editor.main` 才有的），要 `import * as ts from "monaco-editor/languages/features/typescript/register.js"`，用它的 `typescriptDefaults`、`getTypeScriptWorker`。
4. **后台线程**：`editor.worker`、`ts.worker` 各自一个入口，以 IIFE 打到 `workers/`，`MonacoEnvironment.getWorker` 返回 `new Worker("app://runyard/workers/<名>.js")`。语言只要着色，就不引入 CSS/HTML/JSON 的功能文件和线程。
5. **着色**：`shiki/core` 的 `createHighlighterCore` + `shiki/engine/javascript` 的 `createJavaScriptRegexEngine({ forgiving: false })`，语法从 `shiki/langs/<名>.mjs` 单个引入，主题 `shiki/themes/<名>.mjs`；`@shikijs/monaco` 的 `shikiToMonaco`。Monaco 里要先 `languages.register({ id })`（Vue 的 id 是 `vue`，Monaco 不自带）。**`.tsx` 和 `.jsx`**：TS 的功能只挂在语言 id `typescript`/`javascript` 上，所以 `.tsx` 也用 `typescript`；着色再建一个只含 TSX 语法（改名为 `typescript`）的第二个高亮器，对 Monaco 调用第二次 `shikiToMonaco`，让 `typescript` 用 TSX 语法着色（JS 的语法本身带 JSX）。副作用：`.ts` 里的 `<T>x` 类型断言按 TSX 解析，**没有测**。
6. **TS 选项**：`allowNonTsExtensions`、`allowJs`、`noEmit`、`jsx: ReactJSX`、`moduleResolution: NodeJs`；`diagnosticCodesToIgnore: [2307, 2792, 7016, 7026, 2875]`；不要装 React 等类型。
7. **项目文件**：没打开的文件用 `setExtraLibs`（路径用 `file://` 地址），打开的文件才建模型。陷阱：**同一个路径先是 extra lib、后建模型，模型的版本号（1）与 extra lib 的版本号相同，TS 当成没变，类型是旧的**；建好模型后立刻做一次编辑（版本号变 2）才对（实测：不做时仍是旧结果，做之后出现 2305）。每次 `setExtraLibs`/`setDiagnosticsOptions` 都会重启 TS 线程（约 100–300 ms），文件频繁变动时要合并。
8. **跨文件提示**：内置检查只管本文件。外部改动后，对打开的每个模型自己调用 `getSemanticDiagnostics`，过滤掉第 6 条的码，用 `setModelMarkers` 写入（建议先关掉内置的语义检查，避免两套重复）。
9. **Vue 模型**：编辑器选项 `wordBasedSuggestions: "off"`、`quickSuggestions: false`。
10. **跳转到定义**：`monaco.editor.registerEditorOpener` 里切换或打开文件标签。
11. **本地化**：在入口最前面 `import "monaco-editor/nls/lang/zh-cn.js"`（英文不引入）。
12. **策略**：见 0020。

## 没有验证的

- 运行中切换 Monaco 的语言；剩余英文文字的完整清单。
- 真实按键触发 `⌘F`、`⌥⌘F`、`⌘D`、`F12`；中文输入法下的输入。
- 预加载后的“创建项目到编辑器出现”耗时；Monaco 在应用启动时占用的内存。
- 多显示器、不同缩放比；暗色主题下的各语言配色是否可读（只验证了主题能切）。
- 大文件着色时界面是否一直可响应（只量了总耗时，没量主线程被占用的分段）；WASM 引擎（Oniguruma）的速度对比。
- 改名（重命名符号）只在线程一层核对了位置，没有走界面的输入框；格式化未测（规格没要求）。
- 真实项目（React、Hono 模板）上屏蔽误报的诊断码是否足够；他处文件在磁盘上被改动到 App 里提示更新的整条链路（文件监听到提示），只测了模型层。
- 在 Windows、Linux 上的表现（第一版只做 macOS）。

## 范围

- 正式开关（不带 `--e2e`）的包同样跑通了 v3 变体：策略零违反、补全和主题正常；`--e2e` 只多开了 `nodeCliInspect`，不影响 Monaco。
- 验证页替换了整个界面，没有跑真实界面里的 Base UI 滚动区；它的哈希样式在 0020 采用 `'unsafe-inline'` 后不再需要。
- 提议的策略只验证了验证页，真实界面的各个组件在改策略后要由实现 issue（#256）跑一遍界面测试和视觉基准。
