# 桌面应用的端到端测试（e2e/）

## 用途

Playwright（`_electron`）驱动真正的应用走主要用户流程（issue #180），并和 CI 的打包冒烟（#196）一起放在 `.github/workflows/e2e.yml`（只跑 macos-26，`e2e` 与 `package` 两个任务，暂不是必过检查）。不是库，不替代单元测试。

## 对外暴露什么

不对外暴露。入口是 `pnpm --filter @runyard/desktop e2e`（先构建，跑 `dist/main` 的源码构建）和 `e2e:run`（不构建）；设 `RUNYARD_E2E_APP=<…/Runyard.app/Contents/MacOS/Runyard>` 就改跑打好的包（`package -- --dir --e2e --out <绝对路径>` 打，保留 `nodeCliInspect`）。

## 本包特有的规则

- `e2e/`：Playwright（`_electron`）驱动真正的应用，每个用例自己起一份：临时主目录（`HOME` 指向它，`--root` 也在里面）、用例结束核对应用和管理进程按“进程号加启动时间”都已退出。`support/launch.ts` 管启动与收尾；启动前 `prepare-home.ts` 在这份临时目录预置当天无更新缓存，防止打包用例默认联网；随后执行可选 `prepare` 回调，更新专门用例可以覆盖且不会被默认缓存写回（进程相关的操作走 `@runyard/platform`，不直接用 `child_process`），`support/fixtures.ts` 是 `launch` 夹具和几个共用动作。用例按流程分文件：`create-flow`（首次启动、选择器、新建、启动进度、预览、关标签页确认；React 19 自动保存）、`editor`、`script`（运行、输出、标准输入）、`missing-tool`（用设置里的“指定路径”把工具指到只报旧版本的假程序，脚本、网页、服务三类都显示缺工具画面，不留上一次的输出）、`terminal`、`library`（搜索、筛选、重命名、备注、废纸篓）、`settings`、`quit`（⌘Q 停标签页的运行、留命令行的运行）、`links`（`runyard://` 链接和更新提示：在应用进程里发 `open-url` 事件，不向系统登记协议，更新记录用文件预置，不联网）。
- 写用例的规矩：对话框出现后先等输入框拿到焦点再按键；空资源库的选择器只在应用读到空库时自动弹出，要关它就在命令行建项目之前关（命令行抢先建好，选择器就不会出现）；不用固定睡眠；启动阶段一闪而过的东西用页面里的观察器记下；快捷键是系统菜单项，页面里按键到不了，用 `pressMenuShortcut` 触发同一个菜单项。
- 跑打好的包时命令行用包里的启动脚本；源码版的命令行会把版本不同的管理进程换掉，应用就看不到命令行建的东西。

## 子目录地图

- `support/launch.ts`：启动与收尾（进程相关的操作走 `@runyard/platform`，不直接用 `child_process`，`platform-branching` 检查会拦）；`support/fixtures.ts`：`launch` 夹具和共用动作。
- 用例按流程分文件：`create-flow`（首次启动、选择器、新建、启动进度、预览、关标签页确认；React 19 自动保存）、`editor`、`script`（运行、输出、标准输入）、`missing-tool`（用设置里的“指定路径”把工具指到只报旧版本的假程序，脚本、网页、服务三类都显示缺工具画面，不留上一次的输出）、`terminal`、`library`（搜索、筛选、重命名、备注、废纸篓）、`settings`、`quit`（⌘Q 停标签页的运行、留命令行的运行）、`links`（`runyard://` 链接和更新提示：在应用进程里发 `open-url` 事件，不向系统登记协议，更新记录用文件预置，不联网）。

## 测试

`m3-flow.e2e.ts` 是 #267 的同项目串联：界面新建、编辑保存、原生预览更新、终端真实离线安装并使用本地 file 依赖、关闭后释放 shell 和端口。方法与验收边界见 `docs/architecture/evidence/m3-integrated-flow.md`；不以它替代性能或系统输入法手验。

本目录本身就是测试。本机跑全套约半分钟；失败的截图和报告在 `e2e/.output/`（已忽略）。失败不重试：偶发失败按仓库规则记成带 `flaky` 标签的 issue。

## 常驻全局侧栏回归（#541）

`persistent-sidebar.e2e.ts` 用两个真实 HTML 项目验证项目切换、全局侧栏和文件树独立、资源库键盘入口、运行持有者不变，以及 720 宽覆盖导航时原生预览让位和恢复。旧资源库 Tab 已取消，启动就绪检查主外壳与标签条；返回全部列表使用 `openLibraryPage` 的真实侧栏按钮，不以直接桥调用代替导航。设置始终沿用主窗口，不再等待新窗口或关闭主窗口来关闭设置。

`window-header.measure.ts` 输出 1440/1100 × 中英 × 浅深的资源库展开/收起、项目展开/收起和设置画面，并与只读设计稿并排。先按设计渲染手册生成 Main、MainSidebarHidden、WebLight/Web、Settings 对应画板，再以 `RUNYARD_HEADER_REVIEW_OUTPUT=<新临时目录>` 运行。原生预览截图依真实位置合成且保留原图；输出 README 记录取消资源库 Tab、项目常驻侧栏、主窗口设置这三项已批准设计差异。与其他实窗任务串行运行。
