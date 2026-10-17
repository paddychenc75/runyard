# desktop/library-view Specification

## Purpose
约定桌面应用资源库首页：每个项目一行，显示名称与备注、状态、模板、端口、保留、上次打开、创建者，运行中的排在最前；已停止的项目主操作是“打开”（打开即运行），运行中的是“停止运行”。另含搜索与筛选、侧栏固定筛选、行的更多菜单（重命名、备注、保留、副本、废纸篓、外部编辑器、终端、链接）、找不到文件夹、智能体创建的提示和自动清理的提醒。

## Requirements

### Requirement: 资源库列表的内容和顺序
资源库首页 MUST 每个项目一行，依次显示名称与备注、状态、模板、端口、保留、上次打开、创建者、操作；运行中的项目 MUST 排在最前。备注 MUST 显示在名称下方。任何时刻每行 MUST 只显示一个状态。
来源：PRD #prd-library-list；PRD #prd-status-and-ports；PRD #prd-note

#### Scenario: [DESKTOP-LIBRARY-VIEW-01] 运行中的排在最前
- 前提：资源库里有三个项目，只有最近创建时间最早的那个在运行
- **WHEN** 打开资源库页
- **THEN** 运行中的项目在第一行，其余按上次打开的先后排在后面
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-02] 名称、备注与端口
- 前提：一个服务类项目带备注“pricing table layout test”，端口 7101
- **WHEN** 查看它的行
- **THEN** 名称下方显示备注，端口列显示 7101；没有端口的脚本项目端口列为空
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-03] 保留列
- 前提：一个项目是已保留，另一个开启了自动清理且还剩 12 天
- **WHEN** 查看保留列
- **THEN** 前者显示“已保留”，后者显示“剩 12 天”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-04] 创建者
- 前提：一个项目由用户在应用里创建，另一个由智能体 `Claude Code` 经命令行创建
- **WHEN** 查看创建者列
- **THEN** 前者显示“我”，后者显示 `Claude Code`
- 验证：test

### Requirement: 资源库随项目变化实时更新
别处（命令行、智能体）创建、改名、移除、运行状态变化的项目 MUST 在不重启应用的情况下反映在列表里。
来源：PRD #prd-library-list；PRD #prd-agent-created

#### Scenario: [DESKTOP-LIBRARY-VIEW-05] 命令行新建的项目自动出现
- 前提：应用开着，停在资源库页
- **WHEN** 在终端执行 `runyard new html demo`
- **THEN** 列表里出现 `demo` 一行，创建者不是“我”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-06] 状态随运行变化
- 前提：应用开着，列表里有项目 `demo`
- **WHEN** 在终端执行 `runyard run demo`，随后 `runyard stop demo`
- **THEN** 该行的状态先变为运行中相关的状态，最后回到已停止，排序随之变化
- 验证：test

### Requirement: 打开与停止运行
已停止的项目，主操作 MUST 是“打开”，打开即运行：新开（或切到）它的标签页并启动。运行中的项目的操作 MUST 是“停止运行”。资源库里 MUST NOT 有“运行但不打开”。双击一行 MUST 等同“打开”。
来源：PRD #prd-idle-stop；PRD #prd-library-list

#### Scenario: [DESKTOP-LIBRARY-VIEW-07] 打开已停止的项目
- 前提：项目 `demo` 已停止
- **WHEN** 点它那一行的“打开”
- **THEN** 出现 `demo` 的标签页并开始运行，持有者是这个标签页
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-08] 停止运行中的项目
- 前提：项目 `demo` 运行中，没有打开它的标签页
- **WHEN** 点“停止运行”
- **THEN** 运行停止，该行状态变为已停止，操作变回“打开”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-09] 已停止的行没有“停止运行”
- 前提：项目 `demo` 已停止
- **WHEN** 打开该行的更多菜单
- **THEN** 菜单里没有“停止运行”
- 验证：test

### Requirement: “N 个运行中”
资源库页顶栏 MUST 显示“N 个运行中”，N 包含标签页持有和命令行持有的两类运行；已结束的脚本 MUST NOT 计入，正在执行的脚本 MUST 计入。
来源：PRD #prd-run-view；PRD #prd-script-projects

#### Scenario: [DESKTOP-LIBRARY-VIEW-10] 计数包含两类持有者
- 前提：一个标签页持有的服务运行中，一个命令行持有的服务运行中，一个脚本已跑完
- **WHEN** 查看顶栏
- **THEN** 显示“2 个运行中”
- 验证：test

### Requirement: 更多菜单里的访达与路径
每行的更多菜单 MUST 提供“打开”、“停止运行”（只在运行中的行有）、“在访达中显示”和“复制路径”。“在访达中显示”MUST 在访达里选中项目文件夹；“复制路径”MUST 把项目文件夹的绝对路径放进剪贴板。
来源：PRD #prd-library-list；PRD #prd-workspace-menu

#### Scenario: [DESKTOP-LIBRARY-VIEW-11] 复制路径
- 前提：项目 `demo` 的文件夹是 `<资源库根目录>/demo`
- **WHEN** 在更多菜单里选“复制路径”
- **THEN** 剪贴板里是该文件夹的绝对路径
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-12] 在访达中显示
- **WHEN** 在更多菜单里选“在访达中显示”
- **THEN** 访达打开并选中 `demo` 文件夹
- 验证：manual（访达是系统程序，自动化测试里只能断言应用发出了请求）

### Requirement: 搜索
资源库页顶栏 MUST 有搜索框，占位文字写明可搜的范围（名称、备注、模板），并显示快捷键 `⌘F`。在资源库页按 `⌘F` MUST 把焦点放进搜索框。输入后列表 MUST 只留下名称、备注或模板名里含有这段文字的项目（不分大小写），运行中的仍排在最前；MUST NOT 按标签匹配。搜索框有文字时 MUST 有清除按钮，按清除按钮或在搜索框里按 `Esc` MUST 清空文字并恢复完整列表。有搜索或筛选时，页概况 MUST 写“N 个结果 · 共 M 个项目”。
来源：PRD #prd-search-filter；PRD #prd-library-list；PRD #prd-note

#### Scenario: [DESKTOP-LIBRARY-VIEW-13] 按名称、备注和模板匹配
- 前提：资源库里有 `pricing-1`（备注“价格表”）、`landing-hero`（备注“pricing table layout test”）、`hono-1`（模板 Hono）和 `go-channels`
- **WHEN** 在搜索框输入 `Pricing`
- **THEN** 列表只剩 `pricing-1` 和 `landing-hero`；改输入 `hono` 时只剩 `hono-1`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-14] `⌘F` 进入搜索框
- 前提：应用停在资源库页，焦点在表格上
- **WHEN** 按 `⌘F`
- **THEN** 焦点在搜索框里
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-15] 清除搜索
- 前提：搜索框里有 `hono`，列表只剩一行
- **WHEN** 点搜索框里的清除按钮（或在搜索框里按 `Esc`）
- **THEN** 搜索框为空，列表恢复全部项目，页概况不再写“N 个结果”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-16] 页概况写出结果数
- 前提：资源库共 20 个项目
- **WHEN** 输入的文字匹配到 3 个项目
- **THEN** 页概况写“3 个结果 · 共 20 个项目”
- 验证：test

### Requirement: 类型、状态筛选与排序
资源库页 MUST 有“类型”“状态”“排序”三个下拉，默认都是“全部”和“最近打开”。类型的选项 MUST 与模板选择器的分组一致（页面、前端、全栈、脚本、服务）。状态的选项 MUST 是：全部、运行中（含安装中、启动中、正在执行的脚本）、已停止（含已结束的脚本）、有问题（出错、崩溃、缺少运行环境、找不到文件夹）。排序的选项 MUST 是：最近打开、名称、创建时间；无论选哪种排序，运行中的项目 MUST 仍排在最前。下拉、侧栏固定筛选和搜索 MUST 同时生效（取交集），下拉按钮上 MUST 写出当前选中的值。
来源：PRD #prd-search-filter；PRD #prd-library-list

#### Scenario: [DESKTOP-LIBRARY-VIEW-17] 按类型筛选
- 前提：资源库里有页面、前端、脚本三类项目
- **WHEN** 在“类型”下拉里选“脚本”
- **THEN** 只剩脚本类项目，下拉按钮写“类型：脚本”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-18] 按状态筛选
- 前提：两个项目运行中，一个脚本已结束，一个找不到文件夹，其余已停止
- **WHEN** 在“状态”下拉里依次选“运行中”“有问题”
- **THEN** 先只剩两个运行中的项目；再只剩找不到文件夹的那一个
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-19] 筛选与搜索叠加
- 前提：类型选了“前端”
- **WHEN** 再在搜索框输入 `react`
- **THEN** 只剩模板名或名称、备注含 `react` 的前端项目；清除搜索后回到全部前端项目，类型筛选保留
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-20] 换排序时运行中的仍在最前
- 前提：`zeta` 运行中，`alpha` 已停止
- **WHEN** 在“排序”下拉里选“名称”
- **THEN** `zeta` 仍在第一行，其余按名称排列
- 验证：test

### Requirement: 侧栏固定筛选与计数
侧栏“资源库”一组 MUST 有四个固定筛选：全部、已保留、自动清理、智能体创建，每项右侧 MUST 显示符合的项目数，数字随项目变化实时更新。点一项 MUST 只显示符合的项目，页标题 MUST 换成该项的名字，选中项高亮。侧栏“管理”一组的“模板”MUST 显示模板总数并可点（打开模板页），“设置”MUST 可点（打开设置页）。
来源：PRD #prd-search-filter；PRD #prd-cli-creator；PRD #prd-retention

#### Scenario: [DESKTOP-LIBRARY-VIEW-21] 选“智能体创建”
- 前提：20 个项目里 6 个由智能体经命令行创建
- **WHEN** 点侧栏“智能体创建”
- **THEN** 列表只剩这 6 个，页标题是“智能体创建”，侧栏这一项的数字是 6
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-22] 已保留与自动清理两项互补
- 前提：20 个项目里 4 个开了自动清理
- **WHEN** 查看侧栏
- **THEN** “全部”20、“已保留”16、“自动清理”4
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-23] 计数实时更新
- 前提：应用停在资源库页，“智能体创建”是 6
- **WHEN** 智能体在终端执行 `runyard new html demo`
- **THEN** 不用刷新，“全部”和“智能体创建”各加 1
- 验证：test

### Requirement: 搜索没有结果
搜索或筛选后一个项目都没有时，表格位置 MUST 换成“没有结果”画面：标题“没有找到“<搜索文字>””，说明“名称、备注和模板里都没有这个词。”，按钮“清除搜索”。搜索文字本身是合法的项目名称且没有被占用时，MUST 另有主按钮“新建项目，名称用“<搜索文字>””，点它 MUST 打开模板选择器，之后的新建弹窗里名称预先填好这段文字。
来源：PRD #prd-search-filter；PRD #prd-naming

#### Scenario: [DESKTOP-LIBRARY-VIEW-24] 没有找到
- 前提：没有任何项目的名称、备注、模板含 `websocket`
- **WHEN** 在搜索框输入 `websocket`
- **THEN** 显示“没有找到“websocket””、说明文字、“清除搜索”和“新建项目，名称用“websocket””；页概况写“0 个结果 · 共 N 个项目”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-25] 用搜索文字新建
- 前提：上一个场景的画面
- **WHEN** 点“新建项目，名称用“websocket””，在选择器里选 `html` 并回车
- **THEN** 新建弹窗里名称是 `websocket`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-26] 不合法的搜索文字不给新建按钮
- **WHEN** 搜索 `Hello World`（含大写和空格），没有结果
- **THEN** 只有“清除搜索”，没有新建按钮
- 验证：test

### Requirement: 页概况与资源库位置
资源库页标题下 MUST 写“N 个项目 · M 个正在运行 · 存放在 <资源库根目录>”；侧栏底部 MUST 写资源库根目录和项目数（“~/Runyard”“N 个项目”）。根目录在用户主目录下时 MUST 用 `~` 缩写。
来源：PRD #prd-library-list；PRD #prd-settings-items

#### Scenario: [DESKTOP-LIBRARY-VIEW-27] 写出存放位置
- 前提：资源库根目录是 `<主目录>/Runyard`，20 个项目，4 个运行中
- **WHEN** 查看资源库页
- **THEN** 标题下写“20 个项目 · 4 个正在运行 · 存放在 ~/Runyard”，侧栏底部写“~/Runyard”和“20 个项目”
- 验证：test

### Requirement: 窗口变窄时表格横向滚动
窗口宽度放不下全部列时，“名称与备注”列 MUST 固定在左边、操作列 MUST 固定在右边，中间各列 MUST 一起横向滚动，MUST NOT 把列压窄到截断表头或内容；横向滚动后，每行的状态圆点 MUST 在固定的名称列里仍然看得见。
来源：PRD #prd-library-list

#### Scenario: [DESKTOP-LIBRARY-VIEW-28] 1100 宽时整体横向滚动
- 前提：窗口宽 1100，侧栏展开
- **WHEN** 查看资源库表格
- **THEN** 表头“保留”“创建者”“上次打开”都完整、可滚动看到；名称列和操作列不随滚动移动
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-29] 滚动后仍看得见状态
- 前提：同上，横向滚到最右
- **WHEN** 查看运行中的那一行
- **THEN** 名称列里有它的状态圆点
- 验证：test

### Requirement: 行的选中与键盘
单击一行 MUST 只选中它（整行高亮），MUST NOT 打开；双击或在选中时按回车 MUST 等同“打开”；上下方向键 MUST 移动选中行。
来源：PRD #prd-decision-table（第 11 项）

#### Scenario: [DESKTOP-LIBRARY-VIEW-30] 单击选中、回车打开
- 前提：项目 `demo` 已停止
- **WHEN** 单击它那一行，再按回车
- **THEN** 单击后只高亮，没有新标签页；按回车后出现 `demo` 的标签页并开始运行
- 验证：test

### Requirement: 资源库行的完整“更多”菜单
每行的更多菜单 MUST 依次是：打开（右侧提示“回车”）、打开但不运行、停止运行（只在运行中的行有）；分隔线；重命名…、编辑备注…、自动清理…（右侧写当前状态，如“现在：已保留”“现在：剩 12 天”）；分隔线；另存为模板…、创建副本；分隔线；在外部编辑器中打开、在访达中显示、在终端中打开、复制路径、复制链接；分隔线；移到废纸篓（警示色）。除“打开”“打开但不运行”“停止运行”之外，各项 MUST 与工作区“更多”菜单的同名项行为相同。找不到文件夹的项目，菜单里 MUST 只有“重新定位…”“从资源库移除”“复制路径”。
来源：PRD #prd-search-filter；PRD #prd-workspace-menu；PRD #prd-decision-table（第 12、14 项）

#### Scenario: [DESKTOP-LIBRARY-VIEW-31] 运行中的行的菜单
- 前提：项目 `demo` 运行中
- **WHEN** 打开它那一行的更多菜单
- **THEN** 菜单按上面的顺序列出全部项，含“停止运行”，“自动清理…”右侧写“现在：已保留”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-32] 找不到文件夹的行的菜单
- 前提：项目 `vue-drag-list` 找不到文件夹
- **WHEN** 打开它的更多菜单
- **THEN** 只有“重新定位…”“从资源库移除”“复制路径”
- 验证：test

### Requirement: 打开但不运行
“打开但不运行”对已停止的项目 MUST 打开它的标签页但不启动运行，标签页显示已停止的画面和“运行”按钮，MUST NOT 算一次使用（不重置自动清理的计时）。对已经在运行的项目，它 MUST 与“打开”相同：有标签页的切过去，没有的打开查看，MUST NOT 再启动一次。
来源：PRD #prd-decision-table（第 12 项）；PRD #prd-auto-clean

#### Scenario: [DESKTOP-LIBRARY-VIEW-33] 只打开不运行
- 前提：项目 `demo` 已停止，开着自动清理，上次使用是 10 天前
- **WHEN** 在更多菜单里选“打开但不运行”
- **THEN** 出现 `demo` 的标签页，状态已停止，有“运行”按钮；没有启动运行；资源库里它仍是“剩 N 天”，N 没有变
- 验证：test

### Requirement: 行内重命名与编辑备注
“重命名…”和“编辑备注…”MUST 把该行就地变成编辑状态：上面是名称输入框，下面是备注输入框，右侧“取消”“保存”；“重命名…”时焦点在名称框并全选，“编辑备注…”时焦点在备注框。名称框下 MUST 有说明：“名称同时是文件夹名”，项目正在运行时追加“这个项目正在运行，保存后会停止并用新名称重新启动”，并说明旧的 `runyard://open` 链接会失效。名称 MUST 按新建时的规则行内校验，重名时写“这个名字已被占用”，不合法时写原因，校验不过时“保存”不可点。回车 MUST 保存（输入法确认候选词的回车除外），`Esc` MUST 取消。只改备注 MUST NOT 停止运行；备注可以清空。项目在安装依赖或启动中时，“重命名…”MUST 不可选并写明原因。改名失败（如文件夹被其他程序占用）MUST 保持原名并写明原因。
来源：PRD #prd-rename；PRD #prd-note；PRD #prd-naming；PRD #prd-decision-table（第 7 项）；PRD #prd-failure-states

#### Scenario: [DESKTOP-LIBRARY-VIEW-34] 重命名运行中的项目
- 前提：`hono-todo-api` 由标签页持有，在端口 7102 运行
- **WHEN** 选“重命名…”，名称框里写着说明“…这个项目正在运行，保存后会停止并用新名称重新启动”；改为 `todo-api` 并按回车
- **THEN** 该行显示 `todo-api`，运行重新启动，端口仍是 7102，持有者仍是那个标签页，标签页标题跟着变
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-35] 重名不能保存
- 前提：已有项目 `demo2`
- **WHEN** 把 `demo` 重命名为 `demo2`
- **THEN** 名称框下写“这个名字已被占用”，“保存”不可点，按回车不保存
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-36] 只改备注不停止运行
- 前提：`demo` 运行中
- **WHEN** 选“编辑备注…”，把备注改为“试 Suspense”并保存
- **THEN** 名称下显示新备注，运行没有停止或重启
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-37] 取消不改任何东西
- 前提：行处于编辑状态，名称和备注都改过
- **WHEN** 按 `Esc`
- **THEN** 行恢复原样，名称和备注都没变
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-38] 安装中不能重命名
- 前提：`demo` 正在安装依赖
- **WHEN** 打开它的更多菜单
- **THEN** “重命名…”不可选，旁边写明安装或启动完成后才能改名
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-39] 改名失败保留原名
- 前提：改名时平台层报文件夹被占用
- **WHEN** 保存新名称
- **THEN** 行仍显示原名，并写明“文件夹被其他程序占用”，可以重试
- 验证：test

### Requirement: 切换已保留与自动清理
“自动清理…”MUST 让用户在“已保留”和“自动清理”（7 天、30 天、90 天或自定义天数）之间切换，当前选中的有勾。改为自动清理后保留列 MUST 显示“剩 N 天”（从上次使用算起），改为已保留后显示“已保留”。悬停在保留列的“剩 N 天”上 MUST 说明“N 天没打开就移到废纸篓，每次打开重新计时”。
来源：PRD #prd-retention；PRD #prd-auto-clean

#### Scenario: [DESKTOP-LIBRARY-VIEW-40] 改为自动清理 30 天
- 前提：`demo` 是已保留，上次使用是 2 天前
- **WHEN** 在“自动清理…”里选 30 天
- **THEN** 保留列显示“剩 28 天”，侧栏“自动清理”加 1、“已保留”减 1
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-41] 悬停说明
- **WHEN** 鼠标停在保留列的“剩 28 天”上
- **THEN** 出现说明“28 天没打开就移到废纸篓，每次打开重新计时”
- 验证：test

### Requirement: 创建副本
“创建副本”MUST 新建一个项目：文件夹内容与原项目相同（依赖目录不复制，运行时重新安装），名称按“模板标识加序号”的规则自动取，备注和保留状态沿用原项目，分配新的端口；副本 MUST NOT 自动运行，原项目的运行 MUST 不受影响。完成后副本出现在列表里并被选中。
来源：PRD #prd-workspace-menu；PRD #prd-naming

#### Scenario: [DESKTOP-LIBRARY-VIEW-42] 复制一个运行中的项目
- 前提：`react19-3` 运行中，端口 7104；已有 `react19-1` 到 `react19-4`
- **WHEN** 选“创建副本”
- **THEN** 列表里出现 `react19-5`，已停止、端口不是 7104、备注相同、被选中；`react19-3` 仍在运行
- 验证：test

### Requirement: 移到废纸篓
“移到废纸篓”MUST 先弹确认：标题“把 <名称> 移到废纸篓？”，说明“文件夹会移到废纸篓，可以在废纸篓里恢复。”，再写明它现在是否在运行（运行中的写“会先停止运行”）；按钮“取消”和“移到废纸篓”，按 `Esc` 等于取消。确认后 MUST 先停止它的运行（及该项目的终端和文件监听），再移到废纸篓，该行从列表消失，它的标签页关闭。放不进废纸篓或文件夹被占用时 MUST 失败并写明原因，项目留在列表里，MUST NOT 改成永久删除。
来源：PRD #prd-workspace-menu；ADR 0010

#### Scenario: [DESKTOP-LIBRARY-VIEW-43] 确认弹窗
- 前提：`react18-1` 已停止
- **WHEN** 选“移到废纸篓”
- **THEN** 弹出“把 react18-1 移到废纸篓？”，说明写“文件夹会移到废纸篓，可以在废纸篓里恢复。它现在没有在运行。”，有“取消”“移到废纸篓”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-44] 运行中的先停止
- 前提：`demo` 由标签页持有并运行
- **WHEN** 选“移到废纸篓”并确认
- **THEN** 运行停止、标签页关闭、文件夹进了废纸篓，列表里没有 `demo`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-45] 放不进废纸篓
- 前提：平台层移到废纸篓失败
- **WHEN** 确认移到废纸篓
- **THEN** 显示失败原因，`demo` 仍在列表里，文件夹还在原处
- 验证：test

### Requirement: 外部编辑器、终端与复制链接
“在外部编辑器中打开”MUST 用设置里选的外部编辑器打开项目文件夹；没选过时用自动探测到的编辑器，一个也没有时提示去设置里选择。“在终端中打开”MUST 在系统终端里打开一个位于项目文件夹的窗口。“复制链接”MUST 把 `runyard://open/<名称>` 放进剪贴板。
来源：PRD #prd-workspace-menu；PRD #prd-settings-items；PRD #prd-decision-table（第 14 项）；PRD #prd-link-open

#### Scenario: [DESKTOP-LIBRARY-VIEW-46] 复制链接
- **WHEN** 对 `demo` 选“复制链接”
- **THEN** 剪贴板里是 `runyard://open/demo`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-47] 用设置里的编辑器打开
- 前提：设置里的外部编辑器是 VS Code
- **WHEN** 选“在外部编辑器中打开”
- **THEN** 应用请求用 VS Code 打开 `demo` 的文件夹
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-48] 在终端中打开
- **WHEN** 选“在终端中打开”
- **THEN** 系统终端出现一个新窗口，当前目录是 `demo` 的文件夹
- 验证：manual（终端是系统程序，自动化测试里只能断言应用发出了请求）

### Requirement: 找不到项目文件夹
文件夹找不到的项目，状态列 MUST 显示警示色的“找不到文件夹”，其余列变淡；该行下方 MUST 有一条说明：“<原路径> 不在原来的位置了。可能被移动、改名或删除。”，以及“重新定位…”“从资源库移除”“在访达中显示上一级文件夹”。“重新定位…”MUST 让用户选一个文件夹，里面的项目标识对得上才接受，接受后该行恢复正常、端口和设置不变；对不上 MUST 写明“这个文件夹不是 <名称>”且什么都不改。“从资源库移除”MUST 只从列表里去掉这一项，MUST NOT 动磁盘。对这个项目“打开”MUST NOT 启动，而是显示同一条说明。
来源：PRD #prd-decision-table（第 19 项）；PRD #prd-failure-states

#### Scenario: [DESKTOP-LIBRARY-VIEW-49] 找不到文件夹的行
- 前提：`vue-drag-list` 的文件夹被移走
- **WHEN** 管理进程扫描后
- **THEN** 该行状态是“找不到文件夹”，下方说明写“~/Runyard/vue-drag-list 不在原来的位置了。可能被移动、改名或删除。”，有三个操作
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-50] 重新定位
- 前提：用户把文件夹挪到了 `~/Desktop/vue-drag-list`
- **WHEN** 点“重新定位…”并选中那个文件夹
- **THEN** 该行恢复为已停止，端口仍是原来的
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-51] 选错文件夹
- **WHEN** 重新定位时选了另一个项目的文件夹
- **THEN** 写明“这个文件夹不是 vue-drag-list”，该行仍是找不到文件夹
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-52] 从资源库移除
- **WHEN** 点“从资源库移除”
- **THEN** 该行从列表消失，磁盘上没有任何文件被移动或删除
- 验证：test

### Requirement: 智能体创建的项目
创建者是智能体的行，创建者列 MUST 用徽标写智能体名称，悬停 MUST 显示创建时间和创建命令；点行末的展开按钮 MUST 在行下方展开一行“由 <智能体> 创建 · <时间> · 命令：<命令>”。智能体经命令行创建并运行一个项目时，应用 MUST 在窗口右下角给一条提示：“<智能体> 创建并运行了 <名称>”，下面写地址和时间，按钮“打开”“停止”；提示 MUST NOT 把窗口提到前面，MUST NOT 切换标签页或抢走焦点。“打开”MUST 打开它的标签页（查看命令行持有的运行），“停止”MUST 停止这次运行；点按钮或提示上的关闭后提示消失。只创建没有运行的，MUST NOT 给提示。
来源：PRD #prd-agent-created；PRD #prd-cli-creator

#### Scenario: [DESKTOP-LIBRARY-VIEW-53] 悬停看创建命令
- 前提：`react19-5` 由 Claude Code 用 `runyard new react19 react19-5 --run --note …` 创建
- **WHEN** 鼠标停在它的创建者徽标上
- **THEN** 显示创建时间和这条命令
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-54] 创建并运行时的提示不抢焦点
- 前提：应用开着，当前是 `react-counter` 的标签页，焦点在应用里
- **WHEN** 智能体执行 `runyard new react19 --run`
- **THEN** 右下角出现“Claude Code 创建并运行了 react19-5”，有地址、“打开”“停止”；当前标签页和焦点不变，窗口没有被提到前面
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-55] 从提示打开
- 前提：上一个场景的提示还在
- **WHEN** 点“打开”
- **THEN** 出现 `react19-5` 的标签页，持有者仍是命令行，提示消失
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-56] 只创建不提示
- **WHEN** 智能体执行 `runyard new html`（不带 `--run`）
- **THEN** 列表里出现新行，没有右下角的提示
- 验证：test

### Requirement: 自动清理的提醒
自动清理的项目离到期不足一天时，应用 MUST 在三处提醒，MUST NOT 发系统通知：该行保留列变成警示色的“明天清理”；资源库页顶部一条提示条“N 个项目明天会被自动清理：<名称>（已 D 天没打开）。”（多个时列出名称），按钮“改为保留”“现在清理”“稍后再说”；Dock 图标角标显示待清理的项目数。提示条在资源库页真正显示出来之后，应用才 MUST 回报“提醒已显示”。“改为保留”MUST 把提示条里的项目都改为已保留，提示条、行标签和角标随之消失；“现在清理”MUST 走移到废纸篓的确认；“稍后再说”MUST 只收起提示条，到下次打开应用前不再出现，行标签和角标保留，清理照常按规则进行。
来源：PRD #prd-auto-clean；PRD #prd-retention；PRD #prd-decision-table（第 9 项）

#### Scenario: [DESKTOP-LIBRARY-VIEW-57] 三处提醒
- 前提：`node-ts-1` 自动清理 30 天，已 29 天没打开
- **WHEN** 打开应用到资源库页
- **THEN** 它的保留列写“明天清理”；顶部提示条写“1 个项目明天会被自动清理：node-ts-1（已 29 天没打开）。”；Dock 图标角标是 1；没有系统通知
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-58] 没显示出来就不回报
- 前提：同上，但窗口关着（应用在后台）
- **WHEN** 应用做一轮检查
- **THEN** 角标是 1，但没有回报“提醒已显示”；打开窗口、提示条出现后才回报
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-59] 改为保留
- 前提：提示条显示着
- **WHEN** 点“改为保留”
- **THEN** `node-ts-1` 变为已保留，提示条消失，角标消失
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-60] 稍后再说
- 前提：提示条显示着
- **WHEN** 点“稍后再说”
- **THEN** 提示条收起；该行仍写“明天清理”，角标仍是 1
- 验证：test
