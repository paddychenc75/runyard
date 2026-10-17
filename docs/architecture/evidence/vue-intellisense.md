# Vue 单文件组件智能提示（Volar）的证据：打包后的应用里，官方 Vue 语言工具在后台线程中能做到什么、要花多少

对应 issue #315（负责人 2026-10-17 要求加强语法提示）、规格 `openspec/specs/desktop/editor/spec.md`、K8 的证据 [k8-editor-validation.md](k8-editor-validation.md) 和决策记录 [0020](../decisions/0020-editor-assets-and-csp.md)。K8 的结论里有一条：Vue 文件有着色，但**没有任何补全和类型检查**（场景 46）；这份证据回答“用 Vue 官方语言工具补上这块，可行吗，代价多大”。本文自成一体：验证用的代码是一次性的，放在**不合并的分支** `spike/vue-intellisense`（目录 `spike-vue/`），这里保留做法、数字、结论、踩到的坑和没有验证的部分。

## 一句话结论

- **能跑通，但只跑通了一半。** 在打包后的应用里，Vue 官方语言服务（`@vue/language-service`）放进一个后台线程，与 Monaco 0.57.0 一起，**报错、悬停、跳转到定义、`<script setup>` 的类型和成员补全、模板里的组件名补全**都工作；**组件属性名补全（`<Child |` 弹出 `title`、`count`）和事件补全没有做出来**。属性的类型本身是通的（悬停显示 `(property) title: string`，传错类型、漏传必填属性都能报错），缺的是“把属性名列出来”这一步，原因见“没做出来的”。
- **安全设置不用再放宽**：采用 0020 提议的策略就够，全程零违反，没有任何网络请求。
- **代价不小**：新增约 11.2 MB 的后台线程文件（gzip 2.4 MB）、渲染进程多占约 50 MB 内存、第一次提示约 320 毫秒、依赖链约 77 个包；最大的工作量不在体积，而在**让它读到用户项目真实的类型文件**（本次验证用的是预先放进内存的一小份），这一块没有验证，估计是整件事的大头。
- **建议**：第一版**不纳入完整的 Volar 智能提示**；见“建议和代价”，并请负责人在三个选项里选一个。

## 做法

环境：Apple M3 Max，macOS 27.0.1，Electron 为仓库当前版本，基于 `main` 的 `9533d66` 构建（编辑器页之外的部分与仓库一致）。

1. 依赖装在仓库**之外**的临时目录，没有改动仓库的任何 `package.json`、锁文件或 `dependencies.md`。精确版本：`@vue/language-service@3.3.12`、`@vue/typescript-plugin@3.3.12`（只借用其中三个请求函数）、`@volar/monaco@2.4.28`、`monaco-editor@0.57.0`、`typescript@6.0.3`（与仓库同版本）。测试夹具另装了 `vue@3.5.22`（只取它的类型文件，不进成品）。
2. 做了两个页面变体，共用同一份打包流程：**完整**（Monaco + 后台线程里的 Volar）和 **仅编辑器**（`?novue`：同一个 Monaco，不起 Volar 线程，用来对比内存）。用仓库自己的 `esbuild` 打成 `main.js`（Monaco 与 `@volar/monaco` 客户端）、`workers/vue.worker.js`（Volar 后台线程）、`workers/editor.worker.js`；全部由 `app://runyard/` 提供。内容安全策略用 0020 提议的那一条：`default-src 'none'; script-src app://runyard; img-src data:; font-src app://runyard; style-src app://runyard 'unsafe-inline'`。
3. 用仓库的 `pack.ts --dir --e2e` 打成 `.app`（换上验证页的 `dist/renderer/`），用 DevTools 协议驱动，**每个变体各跑 3 次、每次新起一个进程**：`HOME` 指向新建的临时目录，`--root` 在其中；记录“违反内容安全策略”的事件、全部网络请求、控制台和后台线程的错误；用 `Runtime.getHeapUsage` 读后台线程的 JS 堆，用 `ps` 读各子进程的常驻内存。结束后核对 `~/.runyard` 的修改时间没有变化，只结束自己启动的进程（按进程号加启动时间核对）。
4. 后台线程里的“项目文件系统”是**预先放进内存的**：TypeScript 标准库（`lib.es2022` 和 `lib.dom` 的传递闭包，2.8 MB）、`vue` 与 `@vue/*` 的类型文件加 `@vue/language-core/types/`（1.2 MB）、两个示例组件（`App.vue` 引用 `Child.vue`，`Child.vue` 用 `defineProps`、`defineEmits`）。示例里故意埋了四个错：脚本里把数字赋给字符串、模板里给数字属性传字符串、漏传必填属性、模板里用不存在的变量。
5. 验证项走两条路：**界面路径**（Monaco 的补全控件弹出时间、标记、`editor.action.revealDefinition` 打开了哪个文件）和**线程路径**（直接调后台线程的悬停、跳转，量线程本身的耗时）。

## 结果：按功能

| 功能 | 结果 | 数据 |
| --- | --- | --- |
| 模板里的组件名补全 | **是** | 输入 `<Chi` 弹出 `Child`，136–143 ms（界面路径，含控件渲染） |
| 模板里组件的属性名补全（`<Child |`、`<Child :c|`） | **否** | 只弹出全局的 `:key`、`ref`、`v-*`、`data-`，没有 `title`、`count`；见下 |
| 模板里的事件和指令补全（`<Child @|`） | 未做出 | 2.4 s 内没有候选；这次输入的是写到一半的标签，不能排除是夹具问题，没有再查 |
| `<script setup>` 的类型 | **是** | 悬停：`ref(1)` 为 `Ref<number, number>`，`computed(...)` 为 `ComputedRef<number>`；线程耗时 7–15 ms（第一次），之后 1–4 ms |
| `<script setup>` 里的成员补全 | **是** | 输入 `n.` 弹出 `value`，131–136 ms；`import … from './comp` 弹出目录 `components`，129 ms |
| 悬停（模板里的属性、标签） | **是** | `title="a"` 悬停 `(property) title: string`；`<Child` 悬停 `import Child` |
| 跳转到定义（界面路径） | **是** | 光标在 `import Child` 上触发 `revealDefinition`，编辑器打开器收到 `file:///proj/src/components/Child.vue` |
| 跳转到定义（线程路径） | **是** | 模板标签 `<Child` → `Child.vue`；模板属性 `title="a"` → `Child.vue` 里 `defineProps` 的 `title`（第 2 行）；模板里的 `{{ doubled }}` → 脚本里的声明 |
| 报错 | **是** | 五条标记：脚本类型错误 2322、模板属性类型错误 2322（`:count="'x'"`）、漏传必填属性 2345、模板里不存在的变量 2339、未使用变量 6133。标记走 `@volar/monaco` 的 `activateMarkers`，不需要自己写 |

### 没做出来的：组件属性名补全

官方的做法是：模板补全向 tsserver 里的 `@vue/typescript-plugin` 发请求（`getComponentNames`、`getElementAttrs`、`getComponentProps`……），拿到类型信息再拼成候选。**单独的后台线程里没有 tsserver**，`createVueLanguageServicePlugins` 的默认实现是一个什么都不做的代理，此时模板里连组件名都补不出来。所以这次**自己把 `@vue/typescript-plugin/lib/requests/` 里的三个函数接到同一个 TypeScript 语言服务上**，组件名因此通了，属性名没通。查到的现象：

- 属性补全靠在生成代码的某个映射位置问 TypeScript 要“成员补全”；在我们的接法里，这个位置落在 `new __VLS_10({` 里 `'onSelect'` 这个字符串键的中间（或标识符中间），TypeScript 返回 0 个候选。
- 把 Vue 语言核心的选项从严格模板（`strictTemplates`）换成宽松，位置仍然落在标识符中间，结果相同。
- 属性的类型是通的（悬停、报错、跳转都对），所以不是类型文件缺失。

没有再往下查（已经花了很长时间在更基础的集成问题上，见“踩到的坑”）。这一项**需要在实现 issue 里单独留一个有时限的排查**：可能是我们接请求的方式有误，也可能是 Vue 语言工具在非 tsserver 环境下不受支持的路径；官方没有给出单独后台线程里跑 Vue 的示例，`@volar/monaco` 的说明文档也只讲 TypeScript，不讲 Vue。

## 数字

### 体积

| 项 | 数值 |
| --- | --- |
| `main.js`（Monaco 核心约 3.95 MB，`@volar/monaco` 客户端和 `monaco-types` 等约 0.03 MB） | 3.98 MB，gzip 1.03 MB。**Volar 在主脚本里只多约 0.03 MB** |
| `workers/vue.worker.js` | **11.18 MB，gzip 2.39 MB** |
| 其中：随带的类型文件（TypeScript 标准库 2.82 MB、`vue` 类型 1.18 MB） | 4.03 MB（这是“预先放进内存”的做法；改成从磁盘读，这一项变成 0，但见“没有验证的”） |
| 其中：TypeScript 本体（编译器与语言服务） | 3.59 MB |
| 其中：`vscode-css-languageservice` / `@vue/language-service` / `vscode-html-languageservice` / Monaco 的后台线程底座 / `@vue/language-core` / `vscode-json-languageservice` | 1.02 / 0.95 / 0.55 / 0.31 / 0.16 / 0.11 MB |
| `workers/editor.worker.js` | 0.31 MB（K8 已计入） |
| 对照 K8 | K8 的 TS 后台线程 7.04 MB。若整个编辑器的 TS/JS 也改走 Volar 线程（Volar 的线程本来就是完整的 TypeScript 语言服务），可以不带 Monaco 自己的 TS 线程，净增约 4 MB；**这条路没有验证**（Volar 线程对 `.ts`/`.tsx` 的表现、与 K8 装法的差别都没测） |

可以再瘦的部分：CSS、HTML、JSON 三个语言服务合计约 1.7 MB，只做 TS 提示时可以不带，但它们是 `createVueLanguageServicePlugins` 返回的整套插件的一部分，拆开要自己挑插件，没有试。

### 耗时（打包后的应用，3 次，每次新进程）

| 项 | 3 次的数值 |
| --- | --- |
| 创建后台线程并注册完全部提供者（含线程里加载、解析 11 MB 脚本） | 191、192、193 ms |
| 第一次提示（组件属性位置，补全控件出现） | 317、322、319 ms（含 Monaco 控件渲染和 5 ms 的轮询间隔；K8 的 TS 第一次补全是 215–260 ms，技术设计 §11.1 的目标是 300 ms 内） |
| 之后的提示 | 组件名 136–143 ms，脚本成员 131–136 ms |
| 悬停（线程本身） | 第一次 7–8 ms，之后 1–4 ms |
| 第一批报错出现（从创建线程算起，含建立 TypeScript 程序、读入标准库和 `vue` 类型） | 1265、1270、1285 ms |

### 内存

| 项 | 仅编辑器 | 完整（含 Volar 线程） | 差 |
| --- | --- | --- | --- |
| 渲染进程常驻内存（`ps` 的 RSS，会话结束后 1.5 秒） | 415、416、415 MB | 466、466、471 MB | 约 +50 至 +55 MB |
| 页面的 JS 堆 | 34 MB | 25–40 MB | 无明显差别 |
| Volar 后台线程的 JS 堆 | — | 已用 111 MB，已分配 176 MB（3 次一致） | — |

注意：后台线程是渲染进程里的线程，RSS 的增量（约 50 MB）比线程的 JS 堆（111 MB）小，因为堆里有一部分是还没回收的垃圾，常驻内存读的是 1.5 秒后的值。这是**一个文件、一份 `vue` 类型**的数字；真实项目要加载用户的 `node_modules` 类型、更多文件，只会更大，没有测。

## 内容安全策略和网络

用 0020 提议的策略（`font-src app://runyard`、`style-src app://runyard 'unsafe-inline'`，脚本仍严格）跑 3 次完整变体：

- **零违反**；发往 `app://runyard/` 和 `data:` 以外地址的请求**为零**。
- **不需要**：`worker-src`（后台线程从 `script-src` 回退）、`unsafe-eval`（TypeScript 与 Vue 编译器的打包文件不用 `eval`/`new Function`，实测无违反）、`wasm-unsafe-eval`、`connect-src`、`blob:`。
- **前提**：类型文件不能走网络。`@volar/monaco` 的说明里推荐的“自动下载缺失类型”（`@volar/jsdelivr`，从 CDN 取）**不能用**：它要 `connect-src` 外网，违反技术设计 §6.5“界面不加载任何远程内容”，本次也没有用。正式实现里类型文件只能由主进程从用户磁盘读出，经进程间通信交给后台线程，不改策略。
- 结论：**对 0020 没有新增要求**。

## 依赖：年龄、公告、维护状况（2026-10-18 查）

按 `docs/guides/add-a-dependency.md` 的步骤 2、3 查。A 是 OSV，B 是 GitHub 公告库，C 是项目自己的公告页和发布说明。

| 包 | 版本 | 发布日期（天数） | A、B | C 与维护 |
| --- | --- | --- | --- | --- |
| `@vue/language-service`（及 `@vue/language-core`、`@vue/typescript-plugin`，同版本） | 3.3.12 | 2026-10-02（16 天） | 无、无 | `vuejs/language-tools` 公告页 0 条；**3.3.12 的发布说明含“security: improved handling of untrusted Vue files”**（语言核心加强了对不可信 Vue 文件的处理），3.3.11 没有。3.3.13（2026-10-10，8 天）不满 15 天，按规则不能选；所以 **3.3.12 是满足年龄、又带这条加固的最新版本**。仓库 6.7k 星，MIT，2026-10-13 仍有提交，约每月一到两个发布 |
| `@volar/monaco`（及 `@volar/language-service`、`@volar/typescript`，同版本） | 2.4.28 | 2026-01-31（260 天） | 无、无 | 公告页（`volarjs/volar.js`）0 条；仓库最后提交 2026-03-05；**Monaco 这座桥近 9 个月没有新版本**，维护者实际是一个人（`johnsoncodehk`）。已验证它与 Monaco 0.57.0 能配合，但需要绕两处不兼容（见“踩到的坑”） |
| `volar-service-typescript`（及 css、html、json 等同系列） | 0.0.71 | 2026-05-09（162 天） | 无、无 | `volarjs/services` 公告页 0 条；0.0.x 版本号，API 不承诺稳定；其中 emmet、pug 两个服务在浏览器里是空壳 |
| `monaco-types` / `monaco-languageserver-types` | 0.1.2 / 0.4.1 | 2026-02-20 / 2026-06-05 | 无、无 | `@volar/monaco` 的依赖，只带类型和转换函数 |
| 对照：`monaco-editor` | 0.57.0 | 2026-09-24（24 天） | 无、无 | 已在 `dependencies.md`；间接依赖 DOMPurify 3.4.15 的 5 条低危公告也已记录，本次 OSV 再次命中其中两条，结论不变 |

整个依赖闭包（三个根包加起来，含已在仓库里的 `typescript`）共 **77 个包**；对这 105 个包（含夹具）做了 OSV 批量查询和发布日期核对：

- 命中公告的只有两处：DOMPurify 3.4.15（Monaco 带来的，已知，不受影响，见 `dependencies.md`）和 `@vue/server-renderer` 3.5.22（**只是测试夹具 `vue` 带来的，不进成品**；成品里 `vue` 只作为用户项目的类型文件由主进程读出）。Volar、Vue 语言工具、`volar-service-*` 及其依赖：**无公告**。
- 最新的间接依赖是 `source-map-js` 1.2.2（17 天）；**没有不满 15 天的包**，不需要年龄例外或允许清单。
- 许可证：全部 MIT（`@vue/language-service`、`@volar/*`、`volar-service-*`）。
- 安装脚本：本次用 `--ignore-scripts` 安装，没有验证这些包是否带安装脚本；真正安装时按步骤 6 查看。

维护状况的判断：Vue 官方语言工具本身活跃（官方项目、每月发布、有安全加固）；风险在它依赖的 **Volar.js 底座和 Monaco 桥由同一个维护者承担，且桥的更新很慢**。

## 替代方案

| 方案 | 能做到什么 | 代价 | 备注 |
| --- | --- | --- | --- |
| **A. 完整 Volar 线程（本次验证）** | 报错、悬停、跳转、脚本类型、组件名补全；属性名补全未通 | 上面全部数字；加上读真实项目类型的工作 | 模板内的类型检查（传错属性、漏传必填属性）只有这条路能做 |
| **B. 只给 `<script>` 块做 TS 提示**（未实测，按 K8 的结论推断） | 把 `.vue` 里的 `<script>`、`<script setup>` 内容抽成一个虚拟的 `.ts` 模型（其余部分用空格补齐，位置一一对应），交给 K8 已经验证的 Monaco 自带 TS 线程；脚本里的补全、悬停、跳转、类型错误可用 | 几乎没有新增体积和依赖，不改策略；需要自己声明 `defineProps` 等宏和 `*.vue` 模块的垫片；**模板里完全没有提示和检查**，`<script setup>` 的绑定在模板里用到也看不到；`.vue` 之间的引用类型较弱 | 最便宜的“有总比没有强”；要不要做，取决于负责人说的“加强语法提示”是否包含模板 |
| C. `monaco-volar` | — | — | 不选：最后发布 0.4.0（2023-06），对应已停止维护的 Volar 1.x；`@volar/monaco` 是它的继任者 |
| D. `@vue/language-server` 作为外部进程，经 LSP 接到 Monaco（`monaco-languageclient` 11.0.3） | 读用户磁盘上真实的项目、`tsconfig`、`node_modules`，不用自己搭虚拟文件系统，属性补全走官方完整路径 | 要一个 Node 运行时和 tsserver 进程（应用已有工具链解析，但要带一个能跑 tsserver 的 Node），主进程转发 stdio，`monaco-languageclient` 依赖多；进程内存在渲染进程之外；**完全没有验证** | 解决 A 最难的两件事（项目类型、属性补全），但是更大的一块新架构 |
| E. 维持现状：只有 Shiki 着色 | 与 K8 结论一致，Vue 文件无补全 | 无 | 第一版的下限 |

## 踩到的坑（实现时照做）

1. **后台线程的握手**：用 `editor.createWebWorker({ worker })` 接自己的线程时，必须先给线程发 `"ignore"`，再发一个创建数据（`{}` 即可），否则 `getProxy()` 永远不返回。Monaco 自带的语言线程由 `internal/common/workers.js` 做这两步，公开接口不做。
2. **线程工厂里不能用模型**：Monaco 0.57 在构造 `WebWorkerServer` 的过程中就调用你的工厂函数，此时 `getMirrorModels()` 还不可用（报“Cannot access 'webWorkerServer' before initialization”）。`@volar/monaco` 的说明文档里的写法会在这里崩；做法是构造期间让 `getMirrorModels` 返回空列表，构造完成后（`setTimeout 0`）再转给真实上下文。
3. **esbuild 的 `mainFields` 要写成 `["module", "browser", "main"]`**：默认的 `browser` 优先会选中 `vscode-json-languageservice` 的 UMD 版本，里面有动态 `require`，线程一启动就报 “Dynamic require of './services/jsonCompletion' is not supported”。
4. **去掉 pug、emmet 相关插件**：`createVueLanguageServicePlugins` 返回的整套插件里，`volar-service-pug` 和 `volar-service-emmet` 在浏览器里是空壳（日志写着 “not yet supported for web”），而 `vue-template (jade)` 这个插件会因为空壳的 `provide` 为空而在创建语言服务时崩。按名字过滤掉含 `jade`、`pug`、`emmet` 的插件。**含义：`.vue` 里用 pug 写模板的不支持，Emmet 缩写也没有。**
5. **Vue 语言核心的 `target` 是 Vue 的版本号（如 3.5），不是 TypeScript 的目标**：`getDefaultCompilerOptions(3.5, "vue", true)`。
6. **虚拟文件系统里必须有的文件**：`/node_modules/typescript/lib/lib.*.d.ts`（没有 `ts.sys` 时标准库就在这个路径找）、`vue` 的类型、`@vue/language-core/types/template-helpers.d.ts` 等三个文件（生成的代码会引用，缺了会有一串 “Cannot find name '__VLS_…'”）。
7. **没有 tsserver，Vue 的“请求”要自己接**（见“没做出来的”）。

## 没有验证的

- **真实项目的类型文件怎么进来**（最大的一块）：用户项目的 `node_modules`、`tsconfig.json`/`jsconfig.json` 的 `paths` 和 `compilerOptions`、文件改动的监听。Volar 的文件系统接口（`env.fs`，同步或返回承诺均可，加 `onDidChangeWatchedFiles`）支持这件事，但本次只用了预先放进内存的一小份，没有走主进程的进程间通信，没有量读取延迟。
- 组件属性名、事件、指令的补全（未通，见上）；插槽、`v-model`、泛型组件、`<style>` 块的提示。
- 500 个文件的项目：K8 发现“每个文件一个模型”会让第一次补全等 26–32 秒。Volar 线程对没有模型的文件按需读取，理论上更好，**没有测**。
- 输入中的实际手感：这次的补全是“编程触发、轮询控件”，没有真实按键，没有中文输入法，没有节流和取消的行为。
- 暗色主题下报错波浪线、补全控件的配色；本地化（补全详情是英文，TypeScript 的错误信息也是英文）。
- 线程的启动时机：只在第一次打开 `.vue` 文件时才启动，关掉最后一个 `.vue` 文件后是否销毁，以及 11 MB 脚本在低配机器上的解析时间。
- 格式化（`@vue/language-service` 带格式化，要装 Prettier 之类才有意义，本次没有）。
- 方案 B、D 都只做了推断，没有动手。
- 在 Windows、Linux 上的表现（第一版只做 macOS）。

## 建议和代价

**建议：第一版不纳入完整的 Volar 智能提示（方案 A）。** 理由：

1. 已经做出的部分（报错、跳转、悬停、脚本类型）很有价值，但负责人最想要的“模板里组件和属性的补全”恰恰没做出来，需要未知时长的排查；
2. 最大的工作量（真实项目类型的读取）没有被验证，这是方案 A 的主要风险；
3. 体积（+11 MB）、内存（+50 MB 起）和 77 个包的依赖链，加上桥的维护风险，都是真实的成本；
4. 第一版要先把 K8 已验证的 TS/JS/TSX 智能提示做稳。

**如果要做，估计的代价**（我的估计，不是测量值）：

| 方案 | 工作量 | 主要风险 |
| --- | --- | --- |
| A. 完整 Volar 线程 | 约 4 至 5 人周：线程与 Monaco 的集成和构建 3–4 天；主进程到后台线程的项目文件桥（读真实类型、`tsconfig`、监听）1.5–2 周；属性、事件补全的排查与修复（先限时 3–7 天）；打包后端到端测试、500 个文件的性能、销毁与内存上限约 1 周；依赖逐个按手册查并写进 `dependencies.md` 1–2 天 | 属性补全可能解决不了；桥的单一维护者；项目类型读取的延迟 |
| B. 只给脚本块做 TS 提示 | 约 3 至 5 天（抽取脚本块、位置对齐、宏和 `*.vue` 垫片、单元测试），不新增依赖 | 模板里仍然没有提示，用户可能觉得“没有变化” |
| D. 外部语言服务器 | 未估（没有验证）；估计比 A 更大，但没有“项目类型”这个坑 | 要带 Node 和 tsserver，进程管理 |

**需要负责人决定**：Vue 文件的智能提示，第一版要做到哪一档？

1. **不做**：Vue 文件只有着色（现状，K8 场景 46）；完整的智能提示放到第一版之后单开 issue（建议带上本文的“踩到的坑”和“没有验证的”）。
2. **只做脚本块**（方案 B，约 3–5 天，不增依赖）：`<script>` 里有补全、悬停、跳转和类型错误，模板里没有。
3. **做完整的**（方案 A，约 4–5 人周，有未解决的属性补全风险）：第一版延期或其他项让位。

我的倾向是 1，或者 1 加上第一版之后做 2；理由同上。
