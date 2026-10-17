# desktop/request-panel Specification

## Purpose
约定服务类项目标签页里的请求面板：对这个项目自己的服务发一个请求、看响应、复制为 curl、在浏览器中打开；服务改代码重启后自动重发上一次请求。它一次只发一个请求，不是 API 客户端，没有历史和集合。进程输出的控制台在 desktop/workspace。

## Requirements

### Requirement: 服务类项目有请求面板
服务类项目（模板类型是“服务”）的标签页，右侧 MUST 是请求面板而不是网页预览。面板顶部 MUST 有方法下拉（GET、POST、PUT、PATCH、DELETE，默认 GET）、地址（固定前缀 `127.0.0.1:<端口>`，后面是可编辑的路径，默认 `/`）和“发送”；下面一排是“请求头”“请求体”两个页签，以及“服务重载后自动重发”开关、“复制为 curl”“在浏览器中打开”。请求 MUST 只发往这个项目自己的 `127.0.0.1:<端口>`，路径里写别的主机 MUST NOT 改变目标。
来源：PRD #prd-request-panel；PRD #prd-run

#### Scenario: [DESKTOP-REQUEST-PANEL-01] 服务项目显示请求面板
- 前提：`hono-todo-api` 在 7102 运行
- **WHEN** 打开它的标签页
- **THEN** 右侧是请求面板：方法 GET、地址前缀 `127.0.0.1:7102`、路径框、“发送”、请求头和请求体页签、自动重发开关、“复制为 curl”“在浏览器中打开”；没有网页预览
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-02] 只发往自己的端口
- **WHEN** 在路径框里填 `//example.com/x` 并发送
- **THEN** 请求发往 `127.0.0.1:7102`，路径是 `//example.com/x`；没有任何请求离开本机
- 验证：test

### Requirement: 发送与响应
点“发送”或在路径框里按回车 MUST 发出请求，带上请求头页签里填的头和请求体页签里的内容（GET 不带请求体）。发出后到响应回来之前，“发送”MUST 不可点，一次只有一个请求在途。响应区 MUST 写状态码和原因（成功的用成功色）、耗时、大小，下面“响应体”“响应头”两个页签可切换；响应体是 JSON 时 MUST 按缩进格式化显示，其他原样显示。连不上、等满 30 秒没有响应（超时）或服务中途断开时，响应区 MUST 写明原因，MUST NOT 显示上一次的响应冒充这一次。服务没有就绪（未启动、启动中、已停止、崩溃）时，“发送”MUST 不可点并说明原因。
来源：PRD #prd-request-panel；PRD #prd-decision-table（第 18 项）

#### Scenario: [DESKTOP-REQUEST-PANEL-03] 发一个 GET
- 前提：服务的 `/todos` 返回一段 JSON
- **WHEN** 路径填 `/todos`，点“发送”
- **THEN** 响应区写“200 OK”、耗时和大小，响应体是格式化后的 JSON；切到“响应头”能看到 `content-type`
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-04] 带请求头和请求体的 POST
- **WHEN** 方法选 POST，请求头加 `content-type: application/json`，请求体填 `{"title":"x"}` 并发送
- **THEN** 服务收到这个头和请求体
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-05] 一次只发一个
- 前提：服务的 `/slow` 要 3 秒才响应
- **WHEN** 发送 `/slow` 后立即再点“发送”
- **THEN** 第二次点击无效，只发出了一个请求
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-06] 服务没就绪
- 前提：服务处于启动中
- **WHEN** 查看请求面板
- **THEN** “发送”不可点，旁边说明服务还没就绪
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-07] 请求失败写明原因
- 前提：服务对 `/hang` 不响应也不断开
- **WHEN** 发送 `/hang`
- **THEN** 30 秒后响应区写明超时，没有显示之前的响应
- 验证：test

### Requirement: 记住上一次请求，服务重载后自动重发
每个项目 MUST 记住上一次发出的请求（方法、路径、请求头、请求体），下次打开这个项目的标签页 MUST 恢复填好。服务因为文件变化而由应用重启、重新就绪后，“服务重载后自动重发”开着（默认开）时 MUST 自动重发上一次请求，响应区标明“<时间> 自动重发”；开关关着时 MUST NOT 自动重发。还没发过请求时 MUST NOT 自动重发。
来源：PRD #prd-run；PRD #prd-decision-table（第 18 项）

#### Scenario: [DESKTOP-REQUEST-PANEL-08] 重新打开时恢复
- 前提：上次在 `hono-todo-api` 里发过 `POST /todos` 和一段请求体
- **WHEN** 关掉它的标签页再打开
- **THEN** 方法、路径、请求头和请求体都恢复成上次的样子
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-09] 改代码后自动重发
- 前提：发过 `GET /todos`，自动重发开着
- **WHEN** 外部修改 `src/index.ts`，服务重启并就绪
- **THEN** 自动发出 `GET /todos`，响应区显示新响应并标“自动重发”
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-10] 关掉开关不重发
- 前提：发过 `GET /todos`，关掉“服务重载后自动重发”
- **WHEN** 服务因文件变化重启并就绪
- **THEN** 没有发出请求，响应区仍是上一次手动发送的结果
- 验证：test

### Requirement: 复制为 curl 与在浏览器中打开
“复制为 curl”MUST 把当前填的请求（方法、完整地址、请求头、请求体）写成一条可以直接在终端运行的 `curl` 命令放进剪贴板，特殊字符正确转义。“在浏览器中打开”MUST 用系统默认浏览器打开 `http://127.0.0.1:<端口><路径>`（只在方法是 GET 时可点）。
来源：PRD #prd-request-panel

#### Scenario: [DESKTOP-REQUEST-PANEL-11] 复制为 curl
- 前提：POST `/todos`，请求头 `content-type: application/json`，请求体 `{"title":"it's"}`
- **WHEN** 点“复制为 curl”
- **THEN** 剪贴板里的命令在终端运行时，服务收到同样的方法、路径、头和请求体
- 验证：test

#### Scenario: [DESKTOP-REQUEST-PANEL-12] 在浏览器中打开
- 前提：GET `/todos`，端口 7102
- **WHEN** 点“在浏览器中打开”
- **THEN** 应用请求系统默认浏览器打开 `http://127.0.0.1:7102/todos`
- 验证：test

### Requirement: 请求面板的请求算一次活动
对命令行持有的运行，从请求面板发出的请求 MUST 算一次活动，让空闲自动停止的计时归零。
来源：PRD #prd-idle-stop

#### Scenario: [DESKTOP-REQUEST-PANEL-13] 发请求让计时归零
- 前提：命令行持有的服务已空闲 29 分钟，应用里在查看它
- **WHEN** 从请求面板发一个请求
- **THEN** 空闲计时从 0 重新算起，它在接下来 30 分钟内不会因空闲停止
- 验证：test
