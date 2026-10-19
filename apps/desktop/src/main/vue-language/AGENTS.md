# Vue 语言服务进程

## 用途

实现 ADR 0021 与 DESKTOP-EDITOR-90 至 92（#412）。`VueChannel`（#413）把这层接到 preload 白名单，只允许已打开项目内 `.vue` 文档及补全、详情、悬停、跳转、诊断和取消，不把原始协议暴露给页面。

## 对外暴露什么

- `VueProjects.open(id, folder)` 惰性取得会话，调用者只在项目打开 `.vue` 时使用；同项目复用，第三个项目淘汰最久未用的组，先等旧组退出。
- `sync(id, folder, document)` 保留未保存文本，重启后重放；`closeDocument(id, file)` 同步关闭并从重放记录移除。
- 会话 `request("vue" | "ts", method, params)` 返回协议结果正文；Vue 通知可经 `createVueSession.event` 订阅，状态经 `VueProjects` 第二个参数订阅。
- `close(id)` 用于标签关闭、改名、移到废纸篓；`dispose()` 用于应用退出。现有 `createEditorRelease` / `ProjectRelease` 与退出流程已接线。三次连续失败后本次项目禁用，关闭项目后重开恢复。
- `vue-session.ts` 管请求与文档双向同步，`language-frames.ts` 按字节分帧，`service-paths.ts` 与打包共用入口路径。

## 本包特有的规则

进程只在 `main/integration/vue-process.ts` 启动：独立进程组、精简环境、Electron-as-Node、两处只读权限；按 pid 加启动时间调用平台终止并等待退出。`vue-network-guard.ts` 构建到随包目录，预加载后封锁网络及项目外监听，不用 utilityProcess。

## 子目录地图

- `vue-channel.ts` / `vue-ipc.ts`：路径约束、文档与请求调度、诊断节流、形状校验。
- `vue-operations.ts`：窄请求转两套协议；详情必须来自主进程缓存候选，不接受任意服务器参数。
- `vue-projects.ts`：项目组生命周期与文档重放。
- `vue-session.ts`：双协议请求、同步与通知。
- `language-frames.ts`：有界字节分帧。
- `service-paths.ts`：随包目录入口。

## 测试

单测覆盖权限参数、分帧、两组上限、三次失败、未保存文本重放；`integration/vue-process.platform-dependent.test.ts` 在临时 HOME/项目中以真实 Electron 验证属性补全、权限拒绝和无残留。改权限或协议必须重跑真实进程测试，不能只用假进程证明。

文件变化来自现有 ChangeFeed；依赖安装另在 integration 里只监听项目根与 node_modules 的直接子项，不递归监听整个依赖树。后台变化只使用仍存活的组，不能复活已被淘汰的服务。每个模型有独立 session；open 建立它，sync/close 必须匹配，模型局部版本可从 1 重置。诊断事件带 session 和局部版本，旧回包不覆盖新文本。请求准备和 close 同序，取消后旧请求不能在关闭完成后复活服务。`vue-channel.platform-dependent.test.ts` 验证外部修改与依赖从无到有两条真实路径。

Vue 补全（#414）在 renderer/features/editor 的 `vue-completion-provider.ts` 注册，只接宿主自己的模型，等模型同步完成后请求并核对 session/局部版本。`vue-completion-items.ts` 转换官方两路候选、片段与替换范围；详情文档不信任 HTML/命令。Vue 关闭文字词表建议，自动建议使用真实类型服务。真实补全控件浅深截图由 `e2e/vue-completion.e2e.ts` 保存到测试产物。
