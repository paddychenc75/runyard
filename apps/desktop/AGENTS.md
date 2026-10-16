# @runyard/desktop（桌面应用）

## 用途

桌面应用（技术设计 §2.2、§6）。现在只是最早的开发外壳，让负责人能从源码看到窗口：左边列出资源库里的项目（`playground.list`），每个有“运行”/“停止”（`run.start` 用标签页持有者绑定到本连接，`run.stop`）和状态；运行就绪后右边显示项目的页面（预览）；列表下方用内置模板新建（`playground.create`）。设计系统、标签页、编辑器、终端、设置页等随 M2 的后续 PR；样式朴素，不用设计变量。
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
- 第一次运行会下载 Electron 的二进制（约 100 MB）。
- 界面拿到的唯一接口是预加载脚本交出的 `window.runyard`（`src/shared/desktop-bridge.ts`），只有三样：同步的 `bootstrap`（平台、窗口按钮位置、语言、主题等，技术设计 §6.7）、`call(方法名, 参数)`、`on(事件名, 监听)`。方法和事件是白名单（`library.get`、`run.start`、`run.stop`、`preview.select`、`playground.create`；事件 `library.changed`），表外的名字预加载脚本和主进程都拒绝；动作失败不抛，折进状态里的 `error`（代码加参数）。预加载脚本在页面脚本运行前把 `data-platform`、`data-theme`、`lang` 写到 `<html>`。

## 本包特有的规则

- 只有本包可以导入 `electron`（技术设计 §3.2 规则 1）。界面（`src/renderer/`）没有 Node 接口，也不许导入 `electron`、`client`、`platform`、`core`、`supervisor`；预加载脚本只转发。由 Biome 的 `noRestrictedImports`、`noNodejsModules` 和界面单独的 `tsconfig.renderer.json`（DOM、没有 Node 类型）拦住。可导入的包的唯一出处是 `tooling/checks/layers.json`。
- 单实例：同一份用户数据目录只许一个应用进程，第二次启动直接退出，由已有的进程聚焦窗口（`main/integration/single-instance.ts`）。用户数据目录显式设置（`integration/user-data.ts`）：正式 `Runyard`，从源码运行 `Runyard-dev`，指定 `--root` 时放在 `<root>/.runyard/app-data`；因此不同 `--root` 的试验窗口与正在用的窗口互不抢锁、互不混数据。
- 关窗口（规格 desktop/workspace「关闭窗口与退出应用」）：macOS 上关窗口只是藏起来，应用和运行继续，点 Dock 图标再显示；其他系统关掉最后一个窗口就退出（`integration/window-lifecycle.ts`）。
- 退出：第一次退出请求先 `session.bye`，道别期间的再次请求只拦下（`quit-coordinator.ts`，决策记录 0005）。
- 窗口：`contextIsolation` 开、`sandbox` 开、`nodeIntegration` 关；界面只从 `app://runyard/` 加载打包好的文件（`app-protocol.ts` 只许落在界面目录内），页面带内容安全策略；主进程只响应来自这个地址的 IPC 发送者。
- 预览（技术设计 §6.5）：每个项目一个 `WebContentsView`，沙箱、没有预加载脚本、没有 Node，独立的内存存储分区；只许导航到 `http://127.0.0.1:<端口>`，其他网页链接交给系统浏览器；权限默认拒绝，只放行剪贴板。视图位置由 `shared/layout.ts` 定：列表宽度写一次，主进程据此摆视图，界面据此写 CSS 变量。
- 运行的持有者是标签页：`{ kind: "tab", clientId: <每次启动随机生成>, tabId: "tab-<项目 id>" }`，`wait: "none"`，进度靠 `run.state` 等事件。
- 所有给人看的文字走文案包（`desktop` 组加 `errors.<码>.title`）；代码里不写句子。主进程的 `process.stderr.write` 只写开发者诊断，要有 `// i18n-allow: 理由`。
- 应用拉起的管理进程是脱离的后台进程（从源码运行时用 Electron 自己当 Node 跑 `packages/supervisor/src/main.ts`）。退出时先 `session.bye`；管理进程空闲后自己退出，试验后要立刻清理时，按进程号加启动时间确认后再结束它。
- 窗口底色现在是占位常量（`integration/main-window.ts`），等 `@runyard/tokens`（#162）合并后改取设计变量。
- 还没有：`runyard://` 链接、标签页恢复、预览截图替换浮层、设置里的语言、关窗口时的提示、打包（asar、fuse、签名）。

## 子目录地图

- `src/main/`：主进程。`integration/` 放依赖 Electron 的系统差异（窗口外框与底色、单实例、用户数据目录、启动信息），系统分支只许写在这里；`native-ui/`（菜单、对话框、通知）等第一个菜单出现时再建。`index.ts` 只接线；`composition-root.ts` 经 `@runyard/client` 连接或拉起管理进程（客户端种类 `app`）；`library-controller.ts` 是窗口背后的全部逻辑（不认识 Electron，用假客户端测）；`ipc-handlers.ts` 把界面的消息接到控制器；`preview-view.ts`、`integration/main-window.ts` 是 Electron 接线；`app-protocol.ts`、`preview-policy.ts` 是安全相关的纯判断；`smoke.ts` 是冒烟自检。
- `src/preload/`：预加载脚本，构建成 CommonJS（沙箱里的预加载脚本不能是 ES 模块）。
- `src/renderer/`：界面，纯 DOM。`library-view.ts` 用文案包生成要显示的内容，`render-library.ts` 只负责摆。
- `src/shared/`：主进程、预加载脚本、界面共用的类型和版面常量。

## 测试

纯逻辑用 Vitest 加假客户端（`library-controller.test.ts` 等，测试里不连真管理进程）。Electron 的接线靠 `smoke`，只在本机手动跑：CI 的 Ubuntu 没有显示环境，窗口也不该出现在别人的屏幕上，所以不进 CI。测试和手动试验一律用临时 `--root`，试完用进程号加启动时间确认并结束管理进程。
