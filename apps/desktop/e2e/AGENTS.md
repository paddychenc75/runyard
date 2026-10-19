# 桌面应用的端到端测试（e2e/）

## 用途

Playwright（`_electron`）驱动真正的应用走主要用户流程（issue #180），并和 CI 的打包冒烟（#196）一起放在 `.github/workflows/e2e.yml`（只跑 macos-26，`e2e` 与 `package` 两个任务，暂不是必过检查）。不是库，不替代单元测试。

## 对外暴露什么

不对外暴露。入口是 `pnpm --filter @runyard/desktop e2e`（先构建，跑 `dist/main` 的源码构建）和 `e2e:run`（不构建）；设 `RUNYARD_E2E_APP=<…/Runyard.app/Contents/MacOS/Runyard>` 就改跑打好的包（`package -- --dir --e2e --out <绝对路径>` 打，保留 `nodeCliInspect`）。

## 本包特有的规则

- `e2e/`：Playwright（`_electron`）驱动真正的应用，每个用例自己起一份：临时主目录（`HOME` 指向它，`--root` 也在里面）、用例结束核对应用和管理进程按“进程号加启动时间”都已退出。`support/launch.ts` 管启动与收尾（进程相关的操作走 `@runyard/platform`，不直接用 `child_process`），`support/fixtures.ts` 是 `launch` 夹具和几个共用动作。用例按流程分文件：`create-flow`（首次启动、选择器、新建、启动进度、预览、关标签页确认；React 19 自动保存）、`editor`、`script`（运行、输出、标准输入）、`missing-tool`（用设置里的“指定路径”把工具指到只报旧版本的假程序，脚本、网页、服务三类都显示缺工具画面，不留上一次的输出）、`terminal`、`library`（搜索、筛选、重命名、备注、废纸篓）、`settings`、`quit`（⌘Q 停标签页的运行、留命令行的运行）、`links`（`runyard://` 链接和更新提示：在应用进程里发 `open-url` 事件，不向系统登记协议，更新记录用文件预置，不联网）。
- 写用例的规矩：对话框出现后先等输入框拿到焦点再按键；空资源库的选择器只在应用读到空库时自动弹出，要关它就在命令行建项目之前关（命令行抢先建好，选择器就不会出现）；不用固定睡眠；启动阶段一闪而过的东西用页面里的观察器记下；快捷键是系统菜单项，页面里按键到不了，用 `pressMenuShortcut` 触发同一个菜单项。
- 跑打好的包时命令行用包里的启动脚本；源码版的命令行会把版本不同的管理进程换掉，应用就看不到命令行建的东西。

## 子目录地图

- `support/launch.ts`：启动与收尾（进程相关的操作走 `@runyard/platform`，不直接用 `child_process`，`platform-branching` 检查会拦）；`support/fixtures.ts`：`launch` 夹具和共用动作。
- 用例按流程分文件：`create-flow`（首次启动、选择器、新建、启动进度、预览、关标签页确认；React 19 自动保存）、`editor`、`script`（运行、输出、标准输入）、`missing-tool`（用设置里的“指定路径”把工具指到只报旧版本的假程序，脚本、网页、服务三类都显示缺工具画面，不留上一次的输出）、`terminal`、`library`（搜索、筛选、重命名、备注、废纸篓）、`settings`、`quit`（⌘Q 停标签页的运行、留命令行的运行）、`links`（`runyard://` 链接和更新提示：在应用进程里发 `open-url` 事件，不向系统登记协议，更新记录用文件预置，不联网）。

## 测试

本目录本身就是测试。本机跑全套约半分钟；失败的截图和报告在 `e2e/.output/`（已忽略）。失败不重试：偶发失败按仓库规则记成带 `flaky` 标签的 issue。

#401 的两条整合回归分别在 `editor-external-change.e2e.ts` 与 `terminal-cli-ownership.e2e.ts`：前者用独立 Node 命令写同一 HTML 文件，核对编辑器与原生预览在两秒内同时更新，再走编辑器保存；后者通过真实终端键盘调用随包 CLI，关闭宿主标签后核对另一服务的原进程身份、HTTP 内容及命令行持有者，再主动停止并核对回收。服务夹具沿用正式 Hono 运行器，但测试副本改成无依赖 Node HTTP，避免联网安装干扰持有者验证。应用使用临时 `--root` 时，终端里的命令也要显式带同一个参数，不能误连另一个临时默认资源库。
