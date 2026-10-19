# 桌面应用主进程：资源库的异常与提示、自动清理

## 用途

规格 DESKTOP-LIBRARY-VIEW-49 至 60，设计稿 FolderMissing、AgentActivity、CleanReminder（#185、#184）。本文件只讲这一块；主进程的其余部分见上一级 `apps/desktop/AGENTS.md`。

## 对外暴露什么

不是库。主进程对界面暴露的是桥的几个方法：`clean.keep`、`clean.later`、`clean.shown`、`notice.dismiss`、`playground.revealParent`（白名单在 `src/shared/desktop-bridge.ts`），其余是状态里的字段（`notices`、`cleanReminder`、`cleanDueCount`、`libraryRootSynced`、`TabRow.missing`）。

## 本包特有的规则

- 找不到文件夹：行的状态写警示色的“找不到文件夹”，其余列变淡，行下面用 `DataTable` 的 `renderDetail` 接一条通栏 `MissingNote`（原路径加重新定位…、从资源库移除、在访达中显示上一级文件夹，`playground.revealParent`）；`use-relocate.ts` 把管理进程回的“项目不存在”当作“选错了文件夹”，在说明里写“这个文件夹不是 <名称>”，别的失败走失败弹窗。项目标签页也是同一块（`FolderMissing`，`previewScreenOf` 的 `folder-missing`）；主进程对找不到文件夹的项目不启动（`openProject`、恢复标签页、`startRun` 都挡），启动时先 `library.rescan`。
- 智能体创建并运行的提示（`main/agent-notices.ts`）：`agent.activity` 事件还只是登记表里的名字，所以从项目和运行的变化推——命令行持有的进行中的运行，项目由智能体或命令行创建，创建后 60 秒内开始运行，且不是应用打开之前就在跑的；只创建不运行没有这样的运行，自然不提示。提示是状态里的 `notices`，界面 `NoticeToasts` 画在 body 下的浮层。命令行用户（创建者是 `cli` 且没有智能体名字）自己建的不提示（#418）；智能体标识去掉版本后缀再交给界面（`shared/agent-name.ts`，`claude-code_2-1-2` 显示成 Claude Code）层里并把自己的矩形交给 `useOverlay`（预览让位）；它不拿焦点、不切标签页、不提窗口，“打开”走 `tab.open`（命令行持有的运行只是查看），“停止”走 `run.stop`，`notice.dismiss` 关掉。创建结果带回的 `PATH_NEAR_LIMIT` 也进 `notices`；资源库在同步目录下（`isCloudSynced`，平台层）时新建弹窗给警告（规格没有这两条的桌面场景，见 PR 的“没做或未验证的”）。
- 自动清理（`shared/clean-due.ts` 主进程和界面共用“离到期不足一天”的整天算法；`main/clean-reminders.ts`）：行保留列写“明天清理”；提示条名单、角标数在 `buildLibraryState` 里按时间算，“稍后再说”只记在本次启动的内存里（下次启动恢复）；Dock 角标走 `integration/dock-badge.ts`（`LibraryChrome.publish`），不发系统通知；“提醒已显示”由界面在窗口真正看得见（`document.visibilityState`）且提示条显示后经 `clean.shown` 回报，主进程再 `clean.ackReminder`（窗口关着只有角标）；“改为保留”走 `clean.keep`，“现在清理”逐个走移到废纸篓的确认；主进程启动时和每 10 分钟问一次 `clean.due`，清单里的走 `edits.trash`（与命令行 rm 同一条路径）。
- `ProjectPresence` 只检查索引中已知项目的根目录，窗口获得焦点、该项目文件变化、打开或运行前触发；只有存在性与索引不一致才调用 `library.rescan`，不遍历目录树、不设轮询。读取错误不当成缺失。`ProjectOpening` 共用普通打开/打开但不运行的守卫；缺失请求回资源库并通过 `libraryReveal` 清除筛选、选中说明行，会话恢复仍保留缺失标签。
- 状态里新增的字段（`PlaygroundRow.folder`、`TabRow.missing`、`LibraryState.libraryRootSynced` 等）都是可选的，没给按空处理，免得手工拼状态的测试被连累。

## 子目录地图

- `agent-notices.ts`：右下角提示的推导；`clean-reminders.ts`：提示条的三个选择、“提醒已显示”的回报和到点的清理检查；`library-chrome.ts`：把资源库文件夹、提醒、提示、Dock 角标从控制器里分出来（控制器文件接近 400 行上限）。
- `integration/dock-badge.ts`：Dock 角标（Electron 接线）。
- `src/shared/clean-due.ts`：主进程和界面共用的“明天清理”判断。

## 测试

`library-controller-notices.test.ts`（场景 49 至 52、54 至 60 的主进程一侧）和 `renderer/app/LibraryNotices.test.tsx`（界面一侧，含 53）；假管理进程是有状态的，用假时钟 `now`。Dock 角标、右下角提示与原生预览的让位、窗口不被提到前面要在真实窗口里看（见 PR 的“怎么验证的”）。

## 链接与检查更新（#190、#191、#192）

规格 DESKTOP-LINKS-01 至 16、DESKTOP-SETTINGS-26 至 31，设计稿 UrlConfirm、UpdateBanner。

- `links/`：`parse-link.ts` 只认 `runyard://open/<名称>` 和 `runyard://new/<模板>`（可选参数只有 `name`、`note`、`clean-after`、`source`，其余丢掉）；`link-handler.ts` 是行为（一次只一个待确认请求、内置模板免确认时每 5 秒最多一个、来自预览页的标明项目），不认识 Electron，宿主接口 `LinkHost`；`link-host.ts` 把它接到资源库控制器；`link-inbox.ts` 是收件箱：`open-url` 事件冷启动时早于 `ready`，入口最前面就挂监听，先排队，资源库读出来后再处理。协议的系统登记只由打包完成（`packaging/builder-config.ts` 的 `protocols`，写进 Info.plist），应用运行时不调用 `setAsDefaultProtocolClient`；冷启动送达（DESKTOP-LINKS-05）只能在打包后的应用上手动验证。
- 预览页里点的 `runyard://` 链接经 `createNavigationGuards` 的第二个回调交给链接处理（页面本身不跳转，别的协议仍一律拦下）。
- 待确认请求（`LibraryState.linkConfirm`）、链接没能照做的提示（`notices` 里 `kind: "link"`）和“有新版本”（`LibraryState.update`）都经 `LibraryChrome` 推给界面，界面只发 `link.confirm`、`link.cancel`、`update.download`、`update.later`。
- `updates/`：`update-checker.ts` 一天最多请求一次 GitHub Releases 的公开接口（`RELEASES_API`），请求不带 Cookie、令牌或任何标识，失败不出声，不下载也不安装；发出请求前就记下“今天查过”（`update-record.ts`，存在应用数据目录的 `update-check.json`）。`canFetch` 为假（从源码运行、冒烟）时只显示记录里已有的，绝不联网；命令行包里没有联网代码（`packages/cli/src/no-update-check.test.ts` 守着）。测试一律用假的 fetch，不碰真实的 GitHub。

## 管理进程被换掉后的重连（#358）

- `reconnecting-client.ts`：控制器拿到的 `LibraryClient` 是它。底层连接断开（管理进程被换掉、重启、意外退出）就按 0.2、0.5、1、2、4 秒的间隔重连并重新订阅（新连接的第一条事件标 `gap`），连上后让管理进程重扫资源库再重读全部数据（接线在 `composition-root.ts` 的 `withReconnect`）；重试用完调用报 `SUPERVISOR_UNAVAILABLE`，下一次调用再起一轮。退出道别前先 `stopReconnecting()`，道别后的断开不重连。
- 管理进程一侧：有桌面应用连着时，别的客户端的 `supervisor.shutdown { ifIdle: true, reason: 'upgrade' }` 被拒绝，所以不同版本的命令行不会再把应用在用的管理进程换掉。
