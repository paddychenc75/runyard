# Vue 语言服务进程

## 用途

实现 ADR 0021 与 DESKTOP-EDITOR-90 至 92（#412）。不含 renderer/preload 通道；#413 从主进程取得 `VueProjects`，只允许已授权项目的文档操作和补全等窄请求，不把原始协议暴露给页面。

## 对外暴露什么

- `VueProjects.open(id, folder)` 惰性取得会话，调用者只在项目打开 `.vue` 时使用；同项目复用，第三个项目淘汰最久未用的组，先等旧组退出。
- `sync(id, folder, document)` 保留未保存文本，重启后重放；`closeDocument(id, file)` 同步关闭并从重放记录移除。
- 会话 `request("vue" | "ts", method, params)` 返回协议结果正文；Vue 通知可经 `createVueSession.event` 订阅，状态经 `VueProjects` 第二个参数订阅。
- `close(id)` 用于标签关闭、改名、移到废纸篓；`dispose()` 用于应用退出。现有 `createEditorRelease` / `ProjectRelease` 与退出流程已接线。三次连续失败后本次项目禁用，关闭项目后重开恢复。
- `vue-session.ts` 管请求与文档双向同步，`language-frames.ts` 按字节分帧，`service-paths.ts` 与打包共用入口路径。

## 本包特有的规则

进程只在 `main/integration/vue-process.ts` 启动：独立进程组、精简环境、Electron-as-Node、两处只读权限；按 pid 加启动时间调用平台终止并等待退出。`vue-network-guard.ts` 构建到随包目录，预加载后封锁网络及项目外监听，不用 utilityProcess。

## 子目录地图

- `vue-projects.ts`：项目组生命周期与文档重放。
- `vue-session.ts`：双协议请求、同步与通知。
- `language-frames.ts`：有界字节分帧。
- `service-paths.ts`：随包目录入口。

## 测试

单测覆盖权限参数、分帧、两组上限、三次失败、未保存文本重放；`integration/vue-process.platform-dependent.test.ts` 在临时 HOME/项目中以真实 Electron 验证属性补全、权限拒绝和无残留。改权限或协议必须重跑真实进程测试，不能只用假进程证明。
