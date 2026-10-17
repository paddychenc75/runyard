# desktop/links Specification

## Purpose
约定 `runyard://` 链接：`runyard://open/<名称>` 直接打开已有项目，`runyard://new/<模板>` 新建并运行项目但每次都要用户确认（来源只是链接自称的，没有按来源的信任）。应用在运行和没在运行时点链接，效果相同。

## Requirements

### Requirement: `runyard://open/<名称>` 打开已有项目
点 `runyard://open/<名称>` MUST 把应用窗口提到前面并打开这个项目，效果与在资源库里“打开”相同（已有标签页就切过去；命令行持有的运行进入查看画面）。名称 MUST 先按项目名称规则校验；不合法、或没有这个项目（包括改名后的旧名称）时，MUST 在窗口里给一条提示写明原因，MUST NOT 创建或启动任何东西。应用没在运行时点链接，MUST 在启动后照样处理这个链接。
来源：PRD #prd-link-open；PRD #prd-links

#### Scenario: [DESKTOP-LINKS-01] 打开已停止的项目
- 前提：项目 `demo` 已停止
- **WHEN** 在浏览器里点 `runyard://open/demo`
- **THEN** 应用窗口到前面，出现 `demo` 的标签页并开始运行
- 验证：test

#### Scenario: [DESKTOP-LINKS-02] 已经开着就切过去
- 前提：`demo` 的标签页已开着，当前在别的标签页
- **WHEN** 点 `runyard://open/demo`
- **THEN** 切到 `demo` 的标签页，没有第二个标签页，也没有第二次启动
- 验证：test

#### Scenario: [DESKTOP-LINKS-03] 没有这个项目
- **WHEN** 点 `runyard://open/nope`
- **THEN** 窗口里提示没有叫 `nope` 的项目，没有新标签页
- 验证：test

#### Scenario: [DESKTOP-LINKS-04] 不合法的名称
- **WHEN** 点 `runyard://open/..%2Fetc`
- **THEN** 提示链接里的名称不合法，没有读写资源库之外的任何东西
- 验证：test

#### Scenario: [DESKTOP-LINKS-05] 应用没在运行时点链接
- 前提：应用已退出
- **WHEN** 点 `runyard://open/demo`
- **THEN** 应用启动后打开 `demo` 的标签页并开始运行
- 验证：manual（冷启动送达靠系统登记的链接处理程序，只能在打包后的应用上验证；处理逻辑本身由 01 覆盖）

### Requirement: `runyard://new/<模板>` 每次都确认
点 `runyard://new/<模板>` MUST 弹出确认，MUST NOT 在确认前创建或运行任何东西。链接只能指定本机已有的模板，以及可选的名称（`name`）、备注（`note`）、自动清理天数（`clean-after`）和自称的来源（`source`）；其他参数 MUST 忽略。确认框 MUST 写：标题“要新建并运行这个项目吗？”，“来自一个链接”；来源写“自称来自 <source>”，没带的写“未知来源”；模板、名称（没给时按“模板标识加序号”自动取）、文件夹；说明“这个来源是链接自己写的，Runyard 无法核实。新建后会安装依赖并运行模板里的代码，只在你信任它时继续。”；按钮“取消”和“新建并运行”，默认按钮是“取消”（回车和 `Esc` 都是取消）。链接是从某个项目的预览页里发出的，确认框 MUST 另写明“来自项目 <名称> 的预览页”。点“新建并运行”MUST 创建项目、打开它的标签页并运行，持有者是这个标签页。MUST NOT 有“以后信任这个来源”之类的选项。
来源：PRD #prd-link-new；PRD #prd-quality；PRD #prd-decision-table（第 13 项）

#### Scenario: [DESKTOP-LINKS-06] 确认框的内容
- **WHEN** 点 `runyard://new/react19?source=docs.example.dev`
- **THEN** 弹出确认，写“自称来自 docs.example.dev”、模板 React 19、名称 `react19-4`、文件夹 `~/Runyard/react19-4` 和那段说明；默认按钮是“取消”；资源库里还没有新项目
- 验证：test

#### Scenario: [DESKTOP-LINKS-07] 没带来源
- **WHEN** 点 `runyard://new/html`
- **THEN** 确认框写“未知来源”
- 验证：test

#### Scenario: [DESKTOP-LINKS-08] 回车是取消
- 前提：确认框出现
- **WHEN** 直接按回车
- **THEN** 确认框关闭，没有创建项目
- 验证：test

#### Scenario: [DESKTOP-LINKS-09] 确认后新建并运行
- 前提：链接 `runyard://new/html?name=landing&note=首页试验&clean-after=7d` 的确认框
- **WHEN** 点“新建并运行”
- **THEN** 创建 `landing`，备注“首页试验”，自动清理 7 天；它的标签页打开并开始运行，持有者是标签页
- 验证：test

#### Scenario: [DESKTOP-LINKS-10] 不存在的模板
- **WHEN** 点 `runyard://new/rails`
- **THEN** 提示本机没有模板 `rails`，没有确认框，没有创建任何东西
- 验证：test

#### Scenario: [DESKTOP-LINKS-11] 名称不合法或已被占用
- 前提：已有项目 `landing`
- **WHEN** 点 `runyard://new/html?name=landing`
- **THEN** 提示名称已被占用，没有确认框，没有创建任何东西
- 验证：test

#### Scenario: [DESKTOP-LINKS-12] 多余的参数被忽略
- **WHEN** 点 `runyard://new/html?cmd=rm%20-rf&path=/tmp`
- **THEN** 确认框里没有这两个参数的任何内容；确认后创建的项目与不带它们时相同
- 验证：test

#### Scenario: [DESKTOP-LINKS-13] 来自预览页
- 前提：项目 `docs-demo` 的预览页里有一个 `runyard://new/html` 链接
- **WHEN** 在预览里点它
- **THEN** 确认框另写“来自项目 docs-demo 的预览页”
- 验证：test

### Requirement: 同一时间只处理一个新建请求，内置模板可免确认
已有一个确认框开着时，又来的 `runyard://new` 链接 MUST 被丢弃，并提示已有一个待确认的请求。设置里“内置模板免确认”打开后，指向内置模板的链接 MUST 不弹确认、直接新建并运行，指向用户模板的仍 MUST 每次确认；免确认的新建 MUST 每 5 秒最多一次，5 秒内多出的链接 MUST 被丢弃并提示。
来源：PRD #prd-link-new；PRD #prd-settings-items

#### Scenario: [DESKTOP-LINKS-14] 一次只一个
- 前提：一个 `runyard://new/html` 的确认框开着
- **WHEN** 又点了 `runyard://new/vue3`
- **THEN** 第二个链接被丢弃并提示；确认框仍是第一个的内容
- 验证：test

#### Scenario: [DESKTOP-LINKS-15] 内置模板免确认
- 前提：“内置模板免确认”已打开，有一个用户模板 `todo-api`
- **WHEN** 先点 `runyard://new/html`，再点 `runyard://new/todo-api`
- **THEN** 第一个直接新建并运行，没有确认框；第二个弹出确认框
- 验证：test

#### Scenario: [DESKTOP-LINKS-16] 免确认时每 5 秒最多一个
- 前提：“内置模板免确认”已打开
- **WHEN** 1 秒内连续点三次 `runyard://new/html`
- **THEN** 只创建一个项目，另外两次被丢弃并提示
- 验证：test
