# ports Specification

## Purpose

约定每个项目怎样得到一个端口、怎样记住它、端口被占用时怎么办，以及所有服务和探测只在本机回环地址上进行。端口被占用不是错误：本次改用别的端口，下次仍先试原端口。脚本没有端口。

## Requirements

### Requirement: 创建项目时分配并记住一个端口
创建服务类或页面类项目时，系统 MUST 在设置的范围内（默认 7100 到 7999）取没有登记过的最小端口，登记到索引里，之后每次运行 MUST 先试这个端口。脚本类项目 MUST NOT 分配端口。模板和运行器 MUST NOT 写死端口。
来源：PRD #prd-ports

#### Scenario: [RUN-PORTS-01] 第一个项目得到范围内最小端口
- 前提：默认范围 7100 到 7999，没有任何端口被登记
- **WHEN** 创建第一个服务类项目
- **THEN** 它被登记为 7100
- 验证：test

#### Scenario: [RUN-PORTS-02] 后续项目取下一个没登记的最小端口
- 前提：7100 已登记给另一个仍存在的项目
- **WHEN** 再创建一个服务类项目
- **THEN** 它被登记为 7101
- 验证：test

#### Scenario: [RUN-PORTS-03] 脚本没有端口
- **WHEN** 创建一个脚本类项目
- **THEN** 索引里它没有端口，结果里没有 `port` 和 `url`
- 验证：test

#### Scenario: [RUN-PORTS-04] 设置里改了范围
- 前提：设置的端口范围改为 8000 到 8099
- **WHEN** 创建一个新的服务类项目
- **THEN** 它得到 8000；已有项目登记的端口不变
- 验证：test

#### Scenario: [RUN-PORTS-05] 每次运行沿用登记的端口
- 前提：项目登记端口 7104，该端口空闲
- **WHEN** 启动、停止、再启动
- **THEN** 两次都用 7104，结果里没有 `portFallback`
- 验证：test

### Requirement: 端口被占用时只在这一次改用别的端口
启动时登记的端口被占用，系统 MUST 往后找下一个空闲且没有登记给别的项目的端口，MUST 只用于这一次，MUST 在事件和结果里给出原端口、实际端口和占用者（查得到时）；下一次启动 MUST 仍先试登记的端口。这 MUST NOT 被当作错误。
来源：PRD #prd-ports；PRD #prd-failure-states

#### Scenario: [RUN-PORTS-06] 原端口被占用，本次回退
- 前提：项目登记 7104，另一个程序正占着 7104
- **WHEN** 启动该项目
- **THEN** 项目用一个空闲的、没登记给别人的更大端口运行并 `ready`；结果带 `portFallback`（原端口 7104、占用者进程号和名字）；`run.port` 事件发出；命令行退出码 0
- 验证：test

#### Scenario: [RUN-PORTS-07] 回退只对这一次有效
- 前提：上一个场景之后，占用者已退出，项目已停止
- **WHEN** 再次启动
- **THEN** 项目重新使用登记的 7104，登记的端口没有被改成回退的那个
- 验证：test

#### Scenario: [RUN-PORTS-08] 回退端口被另一个项目登记着
- 前提：7104 被占用，7105 登记给了另一个（未运行的）项目
- **WHEN** 启动这个项目
- **THEN** 它不使用 7105，选更后面没登记的空闲端口
- 验证：test

#### Scenario: [RUN-PORTS-09] 命令行指定的端口只用一次
- **WHEN** 执行 `runyard run <名称> --port 7500`
- **THEN** 这次运行用 7500；下次不带 `--port` 时用登记的端口
- 验证：test

### Requirement: 探测和服务只用本机回环地址
判断端口是否空闲 MUST 只在 `127.0.0.1` 和 `::1` 上试绑，MUST NOT 绑定 `0.0.0.0`。所有服务 MUST 只监听 `127.0.0.1`；返回给用户的地址 MUST 写字面量 `127.0.0.1`，MUST NOT 写 `localhost`。就绪探测 MUST 直连 `127.0.0.1`，MUST NOT 读取任何代理设置。
来源：PRD #prd-ports；实现细节

#### Scenario: [RUN-PORTS-11] 监听在所有网卡上的占用者
- 前提：别的程序监听在 `0.0.0.0:7104`
- **WHEN** 探测 7104
- **THEN** 判为 `in-use`；探测本身没有绑定过 `0.0.0.0`
- 验证：test

#### Scenario: [RUN-PORTS-12] 服务只监听本机
- **WHEN** 一个运行 `ready` 后检查它的监听地址
- **THEN** 只有 `127.0.0.1`，没有监听其他地址；结果里的 URL 以 `http://127.0.0.1:` 开头
- 验证：test

#### Scenario: [RUN-PORTS-13] 设了代理环境变量
- 前提：环境里设置了 `http_proxy`
- **WHEN** 探测服务是否就绪
- **THEN** 探测直接连 `127.0.0.1`，不经代理，不因代理返回 503 而误判
- 验证：test

### Requirement: 就绪要看到 HTTP 响应
需要 HTTP 响应的运行器（Next、Nuxt 等先开端口、后编译页面的框架），就绪 MUST 以收到 HTTP 响应为准，MUST NOT 只以端口能连上为准。
来源：实现细节

#### Scenario: [RUN-PORTS-14] 端口先开、页面后好
- 前提：一个服务先监听端口，两秒后才开始响应 HTTP
- **WHEN** 运行器声明用 HTTP 响应判定就绪
- **THEN** 状态在收到第一个 HTTP 响应之后才变为 `ready`
- 验证：test
