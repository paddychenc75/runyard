# @runyard/desktop（桌面应用）

## 用途

桌面应用（技术设计 §2.2、§6）。界面是 React（用 `@runyard/ui`、`@runyard/i18n/react`、`@runyard/tokens`），主窗口有外壳（设计稿 Main）：左边悬浮的玻璃侧栏（`TitleBar`、`NavList`），顶上的标签条（资源库固定在第一位、不能关闭），主题（浅色、深色、跟随系统）和语言（中文系统用简体中文，其余英文）。资源库标签的内容区是资源库页（#169，设计稿 Main、MainNarrow、Empty）：页标题和概况、项目表（`LibraryPage`、`LibraryTable`，用 `DataTable`：名称与备注、状态、模板、端口、保留、上次打开、创建者；运行中的排最前，主进程在 `build-library-state.ts` 里排好），没有项目时是空状态。表随管理进程的 `run`、`playground` 事件实时更新（控制器重读），相对时间和“剩 N 天”每半分钟走字。顶栏有“N 个运行中”（标签页和命令行持有的都算）。操作列是 `RowActions`（#171）：已停止的行主操作“打开”（`tab.open`，打开即运行，双击行同），运行中的是“停止运行”（`run.stop`），后面的更多菜单（`Menu`，网页层，打开期间 `useOverlay` 让预览让位）只有打开、停止运行（仅运行中的行）、在访达中显示（`playground.reveal`）、复制路径（`playground.copyPath`）；设计稿菜单里的重命名、编辑备注、自动清理、另存为模板、创建副本、在外部编辑器和终端中打开、复制链接、移到废纸篓、打开但不运行不在已批准的规格里，随后续 issue（“N 个运行中”的弹层是 #186）。还留着开发期的东西：表下面“用内置模板新建”的按钮（#173 新建对话框）。搜索筛选（#181）、页概况里的“存放在 …”（要管理进程给出资源库路径）还没有。打开项目 = 新开它的标签页并启动运行（`run.start`，持有者是标签页、绑定到本连接）；已开着的只切换、不再启动（规格 DESKTOP-WORKSPACE-01、02）。标签页的内容区上面一行是左边的 `TabContent`（暂时只有项目名，文件树和编辑器随后续 issue）和右边的 `PreviewPane`（地址栏加预览占位区；项目没在运行时占位区是“已停止”画面 `PreviewStopped`，带“运行”按钮）；脚本项目（`kind` 为 `oneshot`）没有预览，右边是 `ScriptOutput`（状态“运行中 · 已 N 秒”“已结束 · 退出码 · 耗时”、停止/运行按钮、输出）；下面是整宽的控制台 `ConsolePanel`（脚本的输出就在右边，不再有控制台）。顶栏右侧是运行条 `RunBar`（项目名、模板、状态、端口、“关闭标签页即停止”、停止/运行，状态文字的判断在 `run-view.ts`）：手动停止后标签仍开着，出现“运行”按钮再次启动，持有者仍是这个标签页（DESKTOP-WORKSPACE-11、12）。控制台：主进程的 `console-logs.ts` 对每个打开的标签页用 `logs.follow` 订阅、事件只当信号并按游标 `logs.read`（读取时已清洗，同命令行的 `logs --follow`），行留在主进程（最多 5000 行，每行一个递增的 `seq`），经 `console.get`（快照）和 `console.appended`（推送，`reset` 表示整体替换，停止后再运行时游标属于更早一次运行就会这样）交给界面；界面切走再回来重新挂载时取回快照（DESKTOP-WORKSPACE-16、17）；进程输出用 `LogView` 显示、不翻译，管理进程插入的提示按提示码翻译。标签条里项目标签名字前的小圆点反映运行状态；项目标签有关闭钮和 ⌘W，关闭运行中的标签前出确认（设计稿 CloseConfirm，规格 DESKTOP-WORKSPACE-04 至 10，见下面“关闭标签页”）。启动清单是 #177；失败画面（#178）见下面“失败状态的画面”。运行条的“重启”和“更多”菜单、控制台的“终端”页签和“清除”还没有。
包是 `private`，没有发布配置。构建用 esbuild 自己打包（`build.ts`，产物在 `dist/`），不用 electron-vite：它要 Vite 7，而 Vite 7.3.7 发布不满 14 天（`docs/architecture/dependencies.md`）。

## 对外暴露什么

不是库。对使用者暴露的是启动方式，在仓库根目录运行：

```sh
pnpm dev                                         # 默认用真实的 ~/Runyard
pnpm dev -- --root "$(mktemp -d /tmp/ry.XXXX)"   # 试验时用临时目录，不碰 ~/Runyard
pnpm --filter @runyard/desktop smoke             # 冒烟自检：窗口不显示，新建、运行、预览、停止，成功退出码 0
```

- `--root <目录>` 或 `RUNYARD_ROOT`：代替主目录（状态目录 `<目录>/.runyard`，资源库 `<目录>/Runyard`），与命令行的 `--root` 一致；路径要短（macOS 的 socket 路径上限 104 字节）。
- `--lang en|zh-CN` 或 `RUNYARD_LANG`：界面语言；缺省看系统语言（中文系统用中文，其余英文）。
- `--theme system|light|dark` 或 `RUNYARD_THEME`：窗口明暗；缺省跟随系统。主进程据此设 `nativeTheme.themeSource`，预加载脚本在页面脚本之前写 `<html data-theme>`；设置页里的切换随后续 PR。
- 第一次运行会下载 Electron 的二进制（约 100 MB）。
- 界面拿到的唯一接口是预加载脚本交出的 `window.runyard`（`src/shared/desktop-bridge.ts`），只有三样：同步的 `bootstrap`（平台、窗口按钮位置、语言、主题等，技术设计 §6.7）、`call(方法名, 参数)`、`on(事件名, 监听)`。方法和事件是白名单（`library.get`、`run.start`、`run.stop`、`tab.open`、`tab.select`、`playground.create`、`playground.reveal`、`playground.copyPath`、`preview.*`、`console.get`、`clipboard.copy`、`link.open`、`files.*`（见下面“文件服务”）；事件 `library.changed`、`picker.open`、`console.appended`、`files.changed`），表外的名字预加载脚本和主进程都拒绝；动作失败不抛，折进状态里的 `error`（代码加参数）。预加载脚本在页面脚本运行前把 `data-platform`、`data-theme`、`lang` 写到 `<html>`。

## 本包特有的规则

- 只有本包可以导入 `electron`（技术设计 §3.2 规则 1）。界面（`src/renderer/`）没有 Node 接口，也不许导入 `electron`、`client`、`platform`、`core`、`supervisor`；预加载脚本只转发。由 Biome 的 `noRestrictedImports`、`noNodejsModules` 和界面单独的 `tsconfig.renderer.json`（DOM、没有 Node 类型）拦住。可导入的包的唯一出处是 `tooling/checks/layers.json`。
- 单实例：同一份用户数据目录只许一个应用进程，第二次启动直接退出，由已有的进程聚焦窗口（`main/integration/single-instance.ts`）。用户数据目录显式设置（`integration/user-data.ts`）：正式 `Runyard`，从源码运行 `Runyard-dev`，指定 `--root` 时放在 `<root>/.runyard/app-data`；因此不同 `--root` 的试验窗口与正在用的窗口互不抢锁、互不混数据。
- 关窗口（规格 desktop/workspace「关闭窗口与退出应用」）：macOS 上关窗口只是藏起来，应用和运行继续，点 Dock 图标再显示；其他系统关掉最后一个窗口就退出（`integration/window-lifecycle.ts`）。
- 退出（规格 DESKTOP-WORKSPACE-24）：⌘Q 的第一次退出请求先 `session.bye`（管理进程停掉本连接名下的标签页运行、命令行持有的不动，最多等 5 秒），道别期间的再次请求只拦下，不重复道别也不二次 `app.quit()`；道别 7 秒没回复也照样退出，不让 ⌘Q 失灵。接线在 `quit-coordinator.ts` 的 `registerQuitFlow`，要在窗口生命周期之后登记（决策记录 0005）。连不上管理进程时没有这条流程，退出直接放行。
- 外壳版面：侧栏、顶栏、列表的尺寸只在 `shared/layout.ts` 写一次（留白和胶囊高度取自设计变量），界面把它们写成 `--layout-*`；macOS 用 `hiddenInset` 标题栏，红黄绿画在侧栏顶上（`integration/main-window.ts`）。
- 窗口：`contextIsolation` 开、`sandbox` 开、`nodeIntegration` 关；界面只从 `app://runyard/` 加载打包好的文件（`app-protocol.ts` 只许落在界面目录内），页面带内容安全策略；主进程只响应来自这个地址的 IPC 发送者。
- 预览（技术设计 §6.1、§6.5）：每个有页面的标签页一个 `WebContentsView`（`preview-view.ts`），沙箱、没有预加载脚本、没有 Node，独立的内存存储分区；页面就绪才创建，没就绪、停止、崩溃时销毁，界面的占位区显示说明；切到资源库或别的标签只是摘下视图、保留着（“只保留最近 3 个”的优化以后做）。导航判断在 `preview-policy.ts`：只许 `http://127.0.0.1:<端口>`，其他网页链接交给系统浏览器、预览不跳转，别的协议（`mailto:`、`runyard://`、`file:`）拦下；权限默认拒绝，只放行剪贴板。位置不在主进程算：界面的 `PreviewSlot`（`renderer/widgets/`）用 `ResizeObserver` 实测自己的矩形，经 `preview.bounds` 报来，主进程据此摆视图。
- 预览与界面浮层（技术设计 §6.1 表）：原生视图永远盖在界面之上，所以弹窗、菜单、下拉打开期间要调 `useOverlay(open, rect?)`（`renderer/shared/overlay-context.tsx`，外壳提供计数器）；与占位区重叠时 `usePreviewSuspension` 先 `preview.capture` 截一帧显示在占位处、等画出来再 `preview.visible(false)`，关闭后换回。弹窗做出来的 PR（#173、#174、#172）在打开时接上这个钩子，关闭、新建、选择器都要。K7 的实测见 `docs/architecture/evidence/k7-preview-view.md`。
- 关闭标签页（`main/library-controller.ts` 的 `requestCloseTab` / `confirmClose` / `cancelClose`，界面 `renderer/app/CloseConfirmDialog.tsx`）：只有“最近一次运行仍在进行且持有者是标签页”才需要确认（`ownedActiveRun`）；已停止的和命令行持有的（只是查看）直接关，不停运行。是否弹出由主进程决定，界面只显示状态里的 `closeRequest`（弹窗期间调 `useOverlay`，预览换成截图）。确认 = 先去掉标签再 `run.stop`（3 秒时限由管理进程保证）；“不再提示”勾选后确认才写设置 `confirmCloseRunningTab: false`（`settings.set`），勾选后取消不记；读不到设置按要确认处理。设置页里重新打开提示随“设置页”issue。
- 失败状态的画面（#178，规格 DESKTOP-WORKSPACE-18 至 22）：`PreviewPane` 按 `failure-view.ts` 的 `previewScreenOf(tab)` 选画面——缺运行环境 `MissingTool`（工具、需要的版本、当前、安装命令和官网来自错误参数，包括模板自己写的 `installCommand` / `installUrl`；命令只经 `clipboard.copy` 复制、官网只经 `link.open`（只放行 https）打开，应用从不执行命令；“重新检测”就是再启动一次；“指定路径…”等设置页做完再接）、启动没成功 `StartFailed`（启动清单停在失败那一步、最后几行输出、重试）、启动较慢 `SlowStart`、崩溃 `CrashedNotice`（盖在预览最后一帧上）；端口改用说明 `PortChanged` 在预览区最上面。数据都在主进程算好放进 `TabRow`：`failure`（代码加参数）、`slow`、`portFallback`、`lastFrame`。服务的 `run.start` 用 `wait: "ready"` 且不阻塞界面（`startRun` 只等一个宏任务）：失败时错误响应带参数（缺哪个工具等），运行状态里只有错误码；脚本仍用 `wait: "none"`。应用重开后拿不到缺工具的参数，那时退回“已停止”加“运行”。崩溃时主进程在销毁预览视图前截下最后一帧（`#keepLastFrame`，只有正显示着的标签能截）。文字走 `errors.<码>.title|body|hint`（`use-error-text.ts`）。“查看（完整）输出”把焦点带到控制台的输出区。
- 文件服务（#257，规格 desktop/editor，技术设计 §6.2、§6.4；`main/editor-files/`，类型和白名单在 `shared/editor-files.ts`）：主进程里编辑器的全部磁盘操作（fs-host 的职责），界面经桥的 `files.*` 调用，只传项目 id 加项目内相对路径，绝对路径一律不收；项目文件夹每次从当前列表查（`projectFolder`）。读（文本判定：前 8 KB 无 NUL 且是合法 UTF-8；超过 5 MB 标 `large`，超过 50 MB 不读内容；报告换行符，BOM 原样保留）；写是平台层的 `writeAtomic`（先写同目录临时文件再改名，失败旧文件完好），改名式写入无视只读位，所以先显式检查，只读的文件保存失败；`files.write` 的 `eol` 把换行统一成文件原来的（规格 DESKTOP-EDITOR-30）。新建（排他创建，同名不覆盖）、改名（不覆盖，文件夹用 `moveDir`）、移到废纸篓（只经平台层 `fs.trash`，失败文件留在原处；`unsaved` 先写入再移走，写不进就不移）。服务拿到的平台对象类型里没有 `removeFile`，永久删除在类型上就做不到。路径限制在 `confine.ts`：拒绝 `..`、绝对路径、反斜杠，符号链接带出项目的一律拒绝（含悬空链接和还不存在的目标）；改名、移走处理链接本身。错误是 `EDITOR_*` 代码加参数（`shared/editor-files.ts` 的 `EditorFileErrors`），失败折进结果、不抛给界面；它们的文案随界面 issue（#258、#259）加进 `desktop` 文案包。监听（`change-feed.ts`）：`files.watch` 开启，变化经 `files.changed` 成批推送；根目录下的 `.git`、`.runyard`、`node_modules` 和常见构建产物目录不监听，任意深度的这三个目录名、原子写入的临时文件都不报；自己保存引起的变化标 `self`（保存前登记内容摘要，事件到时读磁盘比对，外部紧接着改成别的内容不会被吞掉）。树里不显示 `.runyard`、`.git`，`node_modules` 照列、点开才读。测试用真实临时目录和假废纸篓（`test-project.ts`），文件名带 `.platform-dependent`；临时目录不删，留给系统清理。
- 运行的持有者是标签页：`{ kind: "tab", clientId: <每次启动随机生成>, tabId: "tab-<项目 id>" }`，`wait: "none"`，进度靠 `run.state` 等事件。
- 所有给人看的文字走文案包（`desktop` 组加 `errors.<码>.title`）；代码里不写句子。主进程的 `process.stderr.write` 只写开发者诊断，要有 `// i18n-allow: 理由`。
- 应用拉起的管理进程是脱离的后台进程（从源码运行时用 Electron 自己当 Node 跑 `packages/supervisor/src/main.ts`）。退出时先 `session.bye`；管理进程空闲后自己退出，试验后要立刻清理时，按进程号加启动时间确认后再结束它。
- 窗口底色取自 `@runyard/tokens` 的 `windowBackground`（随系统深浅色），界面画出来之前显示，避免启动白闪；`tokens` 只为这一件事导入（技术设计 §3.2）。
- 标签页状态在主进程（`main/workspace-tabs.ts`，只记打开的项目标签的顺序和当前标签，资源库固定在最前不在表里），随 `library.changed` 一起推给界面（`tabs`、`activeTab`）。项目被删时它的标签随之去掉。
- 模板选择器（#172，规格 desktop/create-flow 的 01 至 05）：`renderer/app/PickerDialog.tsx`（浮层，用 `@runyard/ui` 的 `ListPicker`、`SearchField`、`Kbd`；打开期间 `useOverlay(true)`，预览区据此换成截图），分组数据在 `renderer/picker-view.ts`（顶部“最近使用”最多三个，其后按类型）。打开方式两种：空资源库的首次启动（`AppShell` 第一次读到状态时判断一次，不做环境检查）和应用菜单的“新建…”（⌘N，`main/native-ui/app-menu.ts`，焦点在预览视图里也有效，经 `picker.open` 事件通知界面）。“最近使用”由主进程按项目的创建时间推出（`LibraryState.recentTemplates`），不另存。选择器只用已有的模板列表，不触发工具检测；缺工具的模板照常可选。**接缝**：选好模板后 `AppShell.onPick(templateId)` 是交给下一步的唯一出口，新建弹窗（#173）把它换成“打开新建弹窗”；在那之前先用默认名称直接创建。搜索框现在只拿焦点，过滤是后续切片。
- 还没有：`runyard://` 链接、标签页恢复、设置里的语言和主题切换、应用菜单里 ⌘N 以外的项（其余用 Electron 的系统角色）、关窗口时的提示、安装包里随带管理进程、命令行和内置模板（#194：现在打出的包能开窗，但连不上管理进程，列表区显示“连不上管理进程”）、命令行装到 PATH、签名与公证（第一版不做）。

## 打包（#193）

- `pnpm --filter @runyard/desktop package -- --out "$(mktemp -d)"`（入口 `tooling/scripts/package-desktop.ts`，分四步各自打印：esbuild 构建、显式下载 Electron 二进制（`electron:download`，CI 里单独成步）、`pack.ts` 打包并断言开关、`codesign` 校验）；`pack.ts` 把图标同步到 `build/icon.png`，把 `dist/` 拼进临时的应用目录（只有 esbuild 的产物和最小的 `package.json`，依赖已打进单文件，不让打包工具跟随工作区链接），用 electron-builder 26.17.0 出 `.app`、dmg、zip（arm64；`--dir` 只出 `.app`；`--e2e` 保留 `nodeCliInspect`），输出目录不要放在 `/tmp` 下（打包工具把 `/private/tmp` 当不安全路径）；用 `mktemp -d` 的默认位置。输出默认在本包的 `release` 子目录（已忽略），不提交 `.app`、dmg。
- 开关（fuse）取值只在 `packaging/fuses.ts` 写一次（技术设计 §6.5、决策记录 0007）。校验读的是打好的可执行文件里的真实取值（`packaging/verify-fuses.ts`，用 `@electron/fuses`），正式构建断言 `nodeCliInspect` 是关的；出厂的 Electron 反过来是它的反例测试。
- 签名：`mac.identity: "-"`（ad-hoc）加 `resetAdHocDarwinSignature`，打包后 `codesign --verify --deep --strict`，不过就失败。electron-builder 会警告 hardened runtime 与 ad-hoc 签名要 `disable-library-validation`；实测包能正常启动，真机 Gatekeeper 的画面未验证。
- 图标：`build/icon.png` 是 `docs/design/logo/final/png/icon-dock-1024.png` 的副本，`packaging/icon.test.ts` 核对没有脱节；electron-builder 自己转 `.icns`。
- 用户第一次打开的步骤：`docs/guides/first-open-unsigned-app.md`。

## 子目录地图

- `src/main/`：主进程。`integration/` 放依赖 Electron 的系统差异（窗口外框与底色、单实例、用户数据目录、启动信息），系统分支只许写在这里；`integration/system-actions.ts` 是“在访达中显示”（Electron `shell`）和复制路径（剪贴板）；菜单本身是网页层的 `Menu`，没有原生菜单，`native-ui/` 等第一个原生对话框或通知出现时再建。`index.ts` 只接线；`composition-root.ts` 经 `@runyard/client` 连接或拉起管理进程（客户端种类 `app`）；`library-controller.ts` 是窗口背后的全部逻辑（不认识 Electron，用假客户端测），`console-logs.ts` 是各标签页的控制台数据；`ipc-handlers.ts` 把界面的消息接到控制器；`preview-view.ts`、`integration/main-window.ts` 是 Electron 接线；`app-protocol.ts`、`preview-policy.ts`（含导航判断）是安全相关的纯判断；`smoke.ts` 是冒烟自检。
- `src/preload/`：预加载脚本，构建成 CommonJS（沙箱里的预加载脚本不能是 ES 模块）。
- `src/renderer/`：界面，React。`app/`（外壳：`AppFrame` 管文案、`<html>` 属性和版面变量，`AppShell`、`Sidebar`、`TopBar`、`LibraryPage`、`LibraryTable`、`PreviewPane`、`RunBar`、`ScriptOutput`、`ConsolePanel`）、`widgets/`（`PreviewSlot`）、`shared/`（浮层计数器）、`bridge/`（全仓库唯一读 `window.runyard` 的地方，`ui-layers` 守着；别处经 `getDesktopBridge()` 取接口）、`library-view.ts`（列表每一格显示什么的纯判断：状态标记、保留剩余天数、模板缩写、创建者）。CSP 里 `img-src data:` 只为显示主进程截来的预览那一帧；`style-src` 里有一个哈希，放行 Base UI 滚动区插入的固定 `<style>`（见 `index.html` 的注释）。
- `packaging/`、`pack.ts`、`build/`：打包（见上面“打包”）。
- `src/shared/`：主进程、预加载脚本、界面共用的类型和版面常量。

## 测试

纯逻辑用 Vitest 加假客户端（`library-controller.test.ts` 等，测试里不连真管理进程）。Electron 的接线靠 `smoke`，只在本机手动跑：CI 的 Ubuntu 没有显示环境，窗口也不该出现在别人的屏幕上，所以不进 CI。测试和手动试验一律用临时 `--root`，试完用进程号加启动时间确认并结束管理进程。

界面测试（jsdom 文件）共用一份热身：`vitest.setup.tsx` 在每个文件的用例开始前先画一遍外壳并做一次角色查询，把冷启动的代价（加载、即时编译、jsdom 样式计算）付在装载阶段，不落在该文件第一个用例的时限里（#219、#234）。新增界面测试文件不需要再写自己的热身；不要为此放宽用例的时限。
