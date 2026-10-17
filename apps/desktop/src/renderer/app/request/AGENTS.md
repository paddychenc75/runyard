# 请求面板

## 用途

服务类项目标签页右侧的请求面板（#187，规格 desktop/request-panel，设计稿 Service）：对这个项目自己的服务发一个请求、看响应、复制为 curl、在浏览器中打开，服务重载后自动重发。不是 API 客户端，没有历史和集合。

## 对外暴露什么

不是库。入口是 `RequestPanel`（`WorkspaceLayout` 在 `tab.service` 为真时放在右侧）；主进程一侧暴露 `request.send|getLast|openInBrowser|setAutoResend` 四个桥方法（白名单在 `src/shared/request-bridge.ts`）。

## 本包特有的规则

模板类型是“服务”的项目（`TabRow.service`，`build-library-state.ts` 按模板列表里的 `category === "service"` 标；用户自己另存的模板类型是“我的”，改按它的运行器与某个服务类模板相同来认，见 `serviceTemplateTest`，规格 DESKTOP-REQUEST-PANEL-14）右侧是 `renderer/app/request/RequestPanel.tsx`，不是网页预览；主进程也不为它显示原生预览视图（`library-controller.ts` 的 `#applyPreview`）。界面不碰网络：`request.send` / `request.getLast` / `request.openInBrowser`（`shared/request-bridge.ts`）经 `main/request-ipc.ts`（页面发来的请求先过协议的 `requestSpecSchema`）到 `RunBarActions.sendRequest|lastRequest|openRequestInBrowser`，再转给管理进程的 `request.send|getLast`；页面发来的请求先过协议的 `requestSpecSchema`（路径必须以 `/` 开头、方法只有 GET POST PUT PATCH DELETE），不合的回 `invalid-request`；“在浏览器中打开”由主进程按运行的端口拼 `http://127.0.0.1:<端口><路径>`，解析后主机端口对不上就不打开。纯逻辑在 `request/request-model.ts`（请求头文字 ↔ 数组、`buildCurl` 用单引号转义加 `--globoff` 加 `--data-raw`、有请求体而没写 content-type 时用 `-H 'Content-Type:'` 去掉 curl 自己补的表单类型、JSON 整理、发送是否可点）；状态在 `use-request-panel.ts`：一次只有一个请求在途、发出前清掉上一次的响应（失败不拿旧响应冒充）、打开时 `request.getLast` 恢复、`tab.state` 从 `reloading` 回到 `ready` （或没看到 `reloading`，只看到前后都是 `ready` 而进程号 `TabRow.pid` 换了：重载期间运行 id 和开始时间不变，所以认进程号）且开关开着（默认开；开合按项目存在 `playground.json` 的 `requestAutoResend`，经 `request.setAutoResend` → `playground.update`，规格 DESKTOP-REQUEST-PANEL-15）且发过请求时自动重发上一次发出的请求并标“<时间> 自动重发”。请求头 / 请求体的文本框随内容长高、外面套 `ScrollArea`；响应体 / 响应头在 `ScrollArea` 里，JSON 按 `--color-code-*` 上色。

## 子目录地图

- `RequestPanel.tsx`（发送行、页签与开关行、请求内容、响应）、`JsonText.tsx`（JSON 上色）、`RequestPanel.module.css`
- `use-request-panel.ts`（状态：在途、响应、恢复、自动重发）
- 纯逻辑在 `src/shared/request-model.ts`（主进程测试也要用它跑真的 curl）

## 测试

`RequestPanel.test.tsx`（界面，场景 01、03 至 12）、`src/shared/request-model.test.ts` 和 `request-curl.platform-dependent.test.ts`（真的运行复制出的命令）、`src/main/run-bar-actions.test.ts`、`ipc-handlers.test.ts`（主进程一侧，场景 02、12）、管理进程一侧见 `packages/supervisor/src/request-*.test.ts`（场景 02 至 07、13）。
