# desktop/library-view Specification

## Purpose
约定桌面应用资源库首页：每个项目一行，显示名称与备注（智能体创建的带徽标）、状态、模板、端口、大小、最近使用、自动清理，运行中的排在最前；已停止的项目主操作是“打开”（打开即运行），运行中的是“停止运行”。另含搜索与筛选、侧栏的分组与固定筛选、行的更多菜单（重命名、备注、自动清理、副本、废纸篓、外部编辑器、终端、链接）、找不到文件夹、智能体创建的提示和自动清理的提醒，以及“大小”列和侧栏底部的合计（大小怎样算见 library/disk-usage）。

## Requirements

### Requirement: 资源库列表的内容和顺序
资源库首页 MUST 每个项目一行，依次显示名称与备注、状态、模板、端口、大小、最近使用、自动清理、操作；运行中的项目 MUST 排在最前。备注 MUST 显示在名称下方。任何时刻每行 MUST 只显示一个状态。“自动清理”列没开的 MUST 写淡灰“—”，开了的写“剩 N 天”（到期前一天写“明天清理”），MUST NOT 用胶囊。创建者 MUST NOT 单独成列：智能体创建的 MUST 在名称后面挂写智能体名称的徽标，命令行（不是智能体）创建的挂“命令行”徽标，在应用里创建的不挂。“最近使用”MUST 写最近一次使用的相对时间：在应用里打开（含“打开但不运行”）、命令行运行、创建，取最近的一次（即上次打开的时间和自动清理计时起点两者中较晚的那个）；MUST NOT 因为从没在应用里打开过就写“—”。
来源：PRD #prd-library-list；PRD #prd-status-and-ports；PRD #prd-note

#### Scenario: [DESKTOP-LIBRARY-VIEW-01] 运行中的排在最前
- 前提：资源库里有三个项目，只有最近创建时间最早的那个在运行
- **WHEN** 打开资源库页
- **THEN** 运行中的项目在第一行，其余按最近使用的先后排在后面
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-02] 名称、备注与端口
- 前提：一个服务类项目带备注“pricing table layout test”，端口 7101
- **WHEN** 查看它的行
- **THEN** 名称下方显示备注，端口列显示 7101；没有端口的脚本项目端口列为空
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-03] 自动清理列
- 前提：一个项目没有开启自动清理，另一个开启了自动清理且还剩 12 天
- **WHEN** 查看“自动清理”列
- **THEN** 前者显示淡灰色的“—”（不是胶囊，不写“已保留”），后者显示“剩 12 天”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-04] 创建者
- 前提：一个项目由用户在应用里创建，一个由智能体 `Claude Code` 经命令行创建，一个由人在终端用命令行创建
- **WHEN** 查看三行的名称
- **THEN** 第一个名称后面没有徽标；第二个名称后面有写 `Claude Code` 的徽标；第三个有“命令行”徽标；表格里没有“创建者”一列
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-94] 最近使用
- 前提：现在是 12:00；`a` 11:00 在应用里打开并运行过；`b` 由智能体 10:00 用命令行创建、11:30 用命令行运行过，从没在应用里打开；`c` 11:50 创建后没有用过
- **WHEN** 查看最近使用列，并按“最近使用”排序
- **THEN** 依次写“1 小时前”“30 分钟前”“10 分钟前”，三行都不是“—”；顺序是 `c`、`b`、`a`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-101] 智能体标识带版本后缀时显示成名字
- 前提：一个项目由命令行记下的智能体标识 `claude-code_2-1-2` 创建（环境变量里的原始标识，带版本后缀）
- **WHEN** 查看创建者徽标、展开的“由 … 创建”一行和通知
- **THEN** 都显示 `Claude Code`，不出现版本后缀或原始标识
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
资源库页的页头 MUST 有搜索框，位置在页标题右边、类型、状态、排序几个筛选按钮的前面；顶栏 MUST NOT 有搜索框。搜索框的占位文字写明可搜的范围（名称、备注、模板），并显示快捷键 `⌘F`。在资源库页按 `⌘F` MUST 把焦点放进搜索框。输入后列表 MUST 只留下名称、备注或模板名里含有这段文字的项目（不分大小写），运行中的仍排在最前；MUST NOT 按标签匹配。搜索框有文字时 MUST 有清除按钮，按清除按钮或在搜索框里按 `Esc` MUST 清空文字并恢复完整列表。有搜索或筛选时，页概况 MUST 写“N 个结果 · 共 M 个项目”。
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

#### Scenario: [DESKTOP-LIBRARY-VIEW-65] 搜索框在页头
- 前提：应用停在资源库页，窗口 1440 宽
- **WHEN** 查看页面
- **THEN** 页标题“全部”的右边、“类型”按钮的左边是搜索框；顶栏里只有标签页、“N 个运行中”和“新建”，没有搜索框
- 验证：test

### Requirement: 类型、状态筛选与排序
资源库页 MUST 有“类型”“状态”“排序”三个下拉，默认都是“全部”和“最近使用”。类型的选项 MUST 与模板选择器的分组一致（页面、前端、全栈、脚本、服务）。状态的选项 MUST 是：全部、运行中（含安装中、启动中、正在执行的脚本）、已停止（含已结束的脚本）、有问题（出错、崩溃、缺少运行环境、找不到文件夹）。排序的选项 MUST 是：最近使用、名称、创建时间、大小（从大到小；还在计算和找不到文件夹的排在最后）；无论选哪种排序，运行中的项目 MUST 仍排在最前。下拉、侧栏固定筛选和搜索 MUST 同时生效（取交集），下拉按钮上 MUST 写出当前选中的值。
来源：PRD #prd-search-filter；PRD #prd-library-list；PRD #prd-disk-usage

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

#### Scenario: [DESKTOP-LIBRARY-VIEW-107] 当前排序列的列头带标记
- 前提：排序是“最近使用”
- **WHEN** 查看表头
- **THEN** “最近使用”列头加粗并带向下的小箭头，其余列头没有；点“名称”列头切换为按名称排序
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-20] 换排序时运行中的仍在最前
- 前提：`zeta` 运行中，`alpha` 已停止
- **WHEN** 在“排序”下拉里选“名称”
- **THEN** `zeta` 仍在第一行，其余按名称排列
- 验证：test

### Requirement: 侧栏的分组、固定筛选与计数
侧栏 MUST 依次分三组：“资源库”（全部、运行中、智能体创建）、“清理”（自动清理）、“管理”（模板、设置）。第一版 MUST NOT 显示“长期未使用”（这一页做好后放进“清理”组），侧栏任何地方 MUST NOT 出现“已保留”。“运行中”与状态下拉的“运行中”含义相同（含安装中、启动中、正在执行的脚本）；“自动清理”是开启了自动清理的项目。前五项右侧 MUST 显示符合的项目数，数字随项目变化实时更新。点一项 MUST 只显示符合的项目，页标题 MUST 换成该项的名字，选中项高亮；选中“运行中”时，状态下拉 MUST 写“状态：运行中”并不可改，换到别的项后恢复原来的状态筛选。“管理”组的“模板”MUST 显示模板总数并可点（打开模板页），“设置”MUST 可点（打开设置页）。
来源：PRD #prd-search-filter；PRD #prd-cli-creator；PRD #prd-retention

#### Scenario: [DESKTOP-LIBRARY-VIEW-21] 选“智能体创建”
- 前提：20 个项目里 6 个由智能体经命令行创建
- **WHEN** 点侧栏“智能体创建”
- **THEN** 列表只剩这 6 个，页标题是“智能体创建”，侧栏这一项的数字是 6
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-22] 侧栏的三组和计数
- 前提：20 个项目里 4 个开了自动清理，3 个运行中，6 个由智能体创建
- **WHEN** 查看侧栏
- **THEN** “资源库”组依次是“全部”20、“运行中”3、“智能体创建”6；“清理”组只有“自动清理”4；“管理”组是“模板”“设置”；侧栏里没有“已保留”和“长期未使用”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-23] 计数实时更新
- 前提：应用停在资源库页，“智能体创建”是 6
- **WHEN** 智能体在终端执行 `runyard new html demo`
- **THEN** 不用刷新，“全部”和“智能体创建”各加 1
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-90] 选“运行中”
- 前提：20 个项目里 4 个运行中，状态下拉是“状态：全部”
- **WHEN** 点侧栏“运行中”
- **THEN** 列表只剩这 4 个，页标题是“运行中”，页概况写“4 个结果 · 共 20 个项目”，状态下拉写“状态：运行中”且不可点；再点“全部”后状态下拉恢复“状态：全部”并可点
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-91] 选“自动清理”
- 前提：20 个项目里 4 个开了自动清理
- **WHEN** 点侧栏“自动清理”
- **THEN** 列表只剩这 4 个，每行“自动清理”列都是“剩 N 天”或“明天清理”，页标题是“自动清理”
- 验证：test

### Requirement: 侧栏某一项为空
侧栏的某一项一个项目都没有（且没有搜索和下拉筛选）时，表格位置 MUST 换成该项的空状态：“运行中”写“没有在运行的项目”和“在列表里打开一个项目就会运行；命令行用 runyard run <名称>。”；“智能体创建”写“还没有智能体创建的项目”和“让智能体在终端里运行下面这样的命令，项目会出现在这里，并写明是哪个智能体。”，下面一行命令示例 `runyard new html demo --note "说明这个项目做什么"`；“自动清理”写“没有开启自动清理的项目”和“项目默认一直保留。想让试完就扔的项目自己离开，在“更多”菜单里选“自动清理…”。”。
来源：PRD #prd-search-filter；PRD #prd-agent-created

#### Scenario: [DESKTOP-LIBRARY-VIEW-92] 某一项为空
- 前提：没有任何智能体创建的项目
- **WHEN** 点侧栏“智能体创建”
- **THEN** 表格位置显示“还没有智能体创建的项目”、说明文字和命令示例；页概况写“0 个结果 · 共 N 个项目”
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
资源库页标题下 MUST 写“N 个项目 · M 个正在运行 · 存放在 <资源库根目录>”，没有项目在运行时 MUST 省略中间的“M 个正在运行”一段（“N 个项目 · 存放在 <资源库根目录>”）；侧栏底部 MUST 分两行写资源库根目录和项目数加合计大小（“~/Runyard”“N 个项目 · 共 X”；英文“N playgrounds · X total”）。合计是资源库里所有有结果的项目的总大小之和（含依赖），不是整个根目录的大小，写法与“大小”列相同。还有项目在“正在计算”时 MUST 写“N 个项目 · 正在计算大小”（英文“N playgrounds · calculating size”），MUST NOT 写一个还在变的合计；有结果“不完整”的项目时合计前 MUST 加“≥ ”；一个项目都没有时只写“0 个项目”。合计随项目和大小的变化实时更新。根目录在用户主目录下时 MUST 用 `~` 缩写。
来源：PRD #prd-library-list；PRD #prd-settings-items；PRD #prd-disk-usage

#### Scenario: [DESKTOP-LIBRARY-VIEW-108] 没有项目在运行时省略运行数
- 前提：资源库为空，或有项目但都没运行
- **WHEN** 查看资源库页
- **THEN** 标题下写“0 个项目 · 存放在 ~/Runyard”（有 2 个项目时写“2 个项目 · 存放在 ~/Runyard”）
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-27] 写出存放位置
- 前提：资源库根目录是 `<主目录>/Runyard`，20 个项目，4 个运行中
- **WHEN** 查看资源库页
- **THEN** 标题下写“20 个项目 · 4 个正在运行 · 存放在 ~/Runyard”，侧栏底部写“~/Runyard”和“20 个项目”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-69] 侧栏底部的合计
- 前提：20 个项目都已有结果，总大小之和是 3,113,851,289 字节（约 3.1 GB）
- **WHEN** 分别用中文和英文界面查看侧栏底部
- **THEN** 中文写“~/Runyard”和“20 个项目 · 共 3.1 GB”；英文写“~/Runyard”和“20 playgrounds · 3.1 GB total”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-70] 还在计算时不写合计
- 前提：应用刚打开，20 个项目里 3 个还在计算
- **WHEN** 查看侧栏底部，等 3 个都算完
- **THEN** 先写“20 个项目 · 正在计算大小”；全部算完后换成“20 个项目 · 共 <合计>”，不需要刷新
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-71] 合计随项目变化
- 前提：侧栏底部写“20 个项目 · 共 3.1 GB”（3,113,851,289 字节），其中 `react18-1` 占 412 MB（412,000,000 字节）
- **WHEN** 把 `react18-1` 移到废纸篓
- **THEN** 不用刷新，底部变成“19 个项目 · 共 2.7 GB”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-72] 没有项目时不写合计
- 前提：资源库是空的
- **WHEN** 查看侧栏底部
- **THEN** 写“~/Runyard”和“0 个项目”，没有“共”
- 验证：test

### Requirement: “大小”列
资源库表格 MUST 有“大小”一列（英文 Size），在“端口”和“最近使用”之间，右对齐、用系统字体的等宽数字（MUST NOT 用等宽字体），写项目的总大小（含依赖）。写法 MUST 用应用统一的大小写法：数字加不翻译的单位 `B`、`KB`、`MB`、`GB`、`TB`，中间一个空格，按 1000 进位（与访达显示一致），最多一位小数（整数不写 `.0`），千分位随界面语言；中文和英文界面的数字和单位写法相同。还没有结果时 MUST 用较淡的颜色写“计算中”（英文 Calculating），MUST NOT 写 0；找不到文件夹的项目写“—”；结果“不完整”的数字前加“≥ ”。重算期间 MUST 继续显示上一次的数字。数字变化 MUST 实时反映，不需要刷新；只有按大小排序时，数字变化才 MUST 让行重新排序。点表头“大小”MUST 等于在“排序”下拉里选“大小”，此时表头“大小”旁 MUST 显示向下的箭头；其他表头不可点。悬停在一格数字上 MUST 显示提示：第一行“依赖 <依赖大小>（<找到的依赖目录名，用顿号分开>）”，第二行“其余 <总大小减依赖大小>”；没有依赖目录时只写“没有依赖目录”；结果不完整时再加一行“有 N 处没有权限读取，没有计入”。英文提示分别是“Dependencies <大小> (<目录名，用逗号分开>)”“Everything else <大小>”“No dependency folders”“N locations could not be read and are not counted”。
来源：PRD #prd-disk-usage；PRD #prd-library-list

#### Scenario: [DESKTOP-LIBRARY-VIEW-73] 大小列的写法
- 前提：五个项目的总大小分别是 0 字节、900 字节、1,536 字节、812.4 MB 对应的字节数、2 GB 整（2,000,000,000 字节）
- **WHEN** 分别用中文和英文界面查看大小列
- **THEN** 两种语言都依次写“0 B”“900 B”“1.5 KB”“812.4 MB”“2 GB”，右对齐
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-74] 计算中、找不到、不完整
- 前提：一个项目还没有结果，一个找不到文件夹，一个结果不完整（812.4 MB，跳过 2 处）
- **WHEN** 查看这三行的大小列，并悬停在第三行的数字上
- **THEN** 依次写较淡的“计算中”、“—”、“≥ 812.4 MB”；提示的最后一行写“有 2 处没有权限读取，没有计入”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-75] 悬停看依赖占多少
- 前提：`react-counter` 总大小 186.3 MB，其中 `node_modules` 占 181.9 MB；`go-channels` 没有依赖目录，占 24 KB
- **WHEN** 分别悬停在两行的数字上
- **THEN** 前者提示“依赖 181.9 MB（node_modules）”和“其余 4.4 MB”；后者提示“没有依赖目录”；英文界面前者写“Dependencies 181.9 MB (node_modules)”和“Everything else 4.4 MB”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-76] 按大小排序
- 前提：`zeta` 运行中（10 MB），`alpha` 已停止（900 MB），`beta` 已停止（20 MB），`gamma` 还在计算
- **WHEN** 点表头“大小”
- **THEN** “排序”下拉写“排序：大小”，表头“大小”旁有向下的箭头；行的顺序是 `zeta`、`alpha`、`beta`、`gamma`
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-77] 大小实时更新
- 前提：按“最近使用”排序，`react-counter` 写着“186.3 MB”
- **WHEN** 管理进程报来它的新结果 412 MB
- **THEN** 不用刷新，这一格变成“412 MB”，行的位置不变；改为按大小排序时它按新数字排位
- 验证：test

### Requirement: 窗口变窄时表格收起次要列
窗口宽度放不下全部列时，表格 MUST NOT 横向滚动，MUST 按顺序收起次要列：先收“最近使用”；再收“端口”，此时运行中的行 MUST 在状态文字后面写端口；再把“模板”收成只有模板徽标（悬停显示模板名）。“名称与备注”“状态”“大小”“自动清理”和操作列 MUST 一直显示，表头和内容 MUST NOT 被截断（名称和备注过长时用省略号）。窗口变宽后 MUST 按相反顺序恢复。
来源：PRD #prd-library-list

#### Scenario: [DESKTOP-LIBRARY-VIEW-28] 1100 宽时收起次要列
- 前提：窗口宽 1100，侧栏展开
- **WHEN** 查看资源库表格
- **THEN** 表头依次是“名称与备注”“状态”、模板徽标列、“大小”“自动清理”，没有“最近使用”和“端口”；表格没有横向滚动条；表头文字都完整
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-29] 收列后运行中的行写端口
- 前提：同上，`landing-hero` 运行在 7100
- **WHEN** 查看它的状态格
- **THEN** 写“运行中 :7100”；已停止的行状态格只写“已停止”；窗口拉宽到 1440 后端口回到自己的列
- 验证：test

### Requirement: 行的选中与键盘
单击一行 MUST 只选中它（整行淡强调色底，MUST NOT 有左侧竖条），MUST NOT 打开；双击或在选中时按回车 MUST 等同“打开”；上下方向键 MUST 移动选中行。列表失去焦点时选中行 MUST 改为灰底。鼠标悬停的底色 MUST 比选中的淡。
每行的操作（已停止的“打开”、运行中的“停止运行”，加“更多”）MUST 占最右边固定宽度的一列，MUST NOT 盖在别的列上；平时 MUST 不显示，鼠标移到行上、行被选中或键盘焦点进入这一行时 MUST 显示。操作按钮 MUST 一直在无障碍树里（读屏能找到）。表格 MUST 只占一个 Tab 停点；行被选中时再按 Tab，焦点 MUST 依次进入这一行的操作按钮，按钮有焦点环。
来源：PRD #prd-decision-table（第 11 项）

#### Scenario: [DESKTOP-LIBRARY-VIEW-30] 单击选中、回车打开
- 前提：项目 `demo` 已停止
- **WHEN** 单击它那一行，再按回车
- **THEN** 单击后只高亮，没有新标签页；按回车后出现 `demo` 的标签页并开始运行
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-95] 操作悬停或选中时才出现
- 前提：`demo` 已停止、没有被选中，`web` 运行中
- **WHEN** 鼠标不在 `demo` 行上；再移到 `demo` 行上；再单击选中它并把鼠标移开；再悬停 `web` 行
- **THEN** 先看不到 `demo` 的“打开”和“更多”；悬停后出现；选中后鼠标移开仍在；`web` 行出现的是“停止运行”和“更多”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-96] 键盘进入行内操作
- 前提：焦点在表格上，选中的是已停止的 `demo`
- **WHEN** 按 Tab，再按 Tab
- **THEN** 焦点先到 `demo` 的“打开”，再到它的“更多”，两次都有焦点环；按空格在“打开”上等同点击
- 验证：test

### Requirement: 资源库行的完整“更多”菜单
每行的更多菜单 MUST 依次是：打开（右侧提示“回车”）、打开但不运行、停止运行（只在运行中的行有）；分隔线；重命名…、编辑备注…、自动清理…（右侧写当前状态，如“现在：关闭”“现在：剩 12 天”）；分隔线；另存为模板…、创建副本；分隔线；在外部编辑器中打开、在访达中显示、在终端中打开、复制路径、复制链接；分隔线；移到废纸篓（警示色）。除“打开”“打开但不运行”“停止运行”之外，各项 MUST 与工作区“更多”菜单的同名项行为相同。找不到文件夹的项目，菜单里 MUST 只有“重新定位…”“从资源库移除”“复制路径”。
来源：PRD #prd-search-filter；PRD #prd-workspace-menu；PRD #prd-decision-table（第 12、14 项）

#### Scenario: [DESKTOP-LIBRARY-VIEW-31] 运行中的行的菜单
- 前提：项目 `demo` 运行中
- **WHEN** 打开它那一行的更多菜单
- **THEN** 菜单按上面的顺序列出全部项，含“停止运行”，“自动清理…”右侧写“现在：关闭”
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

### Requirement: 开关自动清理
“自动清理…”MUST 让用户在“关闭”和 7 天、30 天、90 天或自定义天数之间选择，当前选中的高亮；没有开启时弹窗说明写“<名称> 现在没有开启自动清理，会一直保留。”。开启后“自动清理”列 MUST 显示“剩 N 天”（从上次使用算起），关闭后显示“—”。悬停在“自动清理”列的“剩 N 天”上 MUST 说明“N 天没打开就移到废纸篓，每次打开重新计时”。
来源：PRD #prd-retention；PRD #prd-auto-clean

#### Scenario: [DESKTOP-LIBRARY-VIEW-40] 改为自动清理 30 天
- 前提：`demo` 没有开启自动清理，上次使用是 2 天前
- **WHEN** 在“自动清理…”里选 30 天
- **THEN** “自动清理”列显示“剩 28 天”，侧栏“自动清理”加 1
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-41] 悬停说明
- **WHEN** 鼠标停在“自动清理”列的“剩 28 天”上
- **THEN** 出现说明“28 天没打开就移到废纸篓，每次打开重新计时”
- 验证：test

### Requirement: 创建副本
“创建副本”MUST 新建一个项目：文件夹内容与原项目相同（依赖目录不复制，运行时重新安装），名称按“模板标识加序号”的规则自动取，备注和自动清理设置沿用原项目，分配新的端口；副本 MUST NOT 自动运行，原项目的运行 MUST 不受影响。完成后副本出现在列表里并被选中。
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
文件夹找不到的项目，状态列 MUST 显示警示色的“找不到文件夹”，其余列变淡；该行下方 MUST 有一条说明：“<原路径> 不在原来的位置了。可能被移动、改名或删除。”，以及“重新定位…”“从资源库移除”“在访达中显示上一级文件夹”；该行自己的操作列 MUST 只留“⋯”更多菜单，MUST NOT 再放“重新定位…”按钮（它只在说明里出现一次，用强调色）。“重新定位…”MUST 让用户选一个文件夹，里面的项目标识对得上才接受，接受后该行恢复正常、端口和设置不变；对不上 MUST 写明“这个文件夹不是 <名称>”且什么都不改。“从资源库移除”MUST 只从列表里去掉这一项，MUST NOT 动磁盘。对这个项目“打开”MUST NOT 启动，而是显示同一条说明。
来源：PRD #prd-decision-table（第 19 项）；PRD #prd-failure-states

#### Scenario: [DESKTOP-LIBRARY-VIEW-49] 找不到文件夹的行
- 前提：`vue-drag-list` 的文件夹被移走
- **WHEN** 管理进程扫描后
- **THEN** 该行状态是“找不到文件夹”，下方说明写“~/Runyard/vue-drag-list 不在原来的位置了。可能被移动、改名或删除。”，有三个操作
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-105] 找不到文件夹的行内只有更多菜单
- 前提：`vue-drag-list` 的文件夹被移走
- **WHEN** 查看该行
- **THEN** 该行操作列里只有“⋯”，没有“重新定位…”和“打开”；“重新定位…”只在行下的说明里出现一次
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
创建者是智能体的行，名称后面 MUST 用徽标写智能体名称，悬停 MUST 显示创建时间和创建命令；点这个徽标 MUST 在行下方展开一行“由 <智能体> 创建 · <时间> · 命令：<命令>”。智能体经命令行创建并运行一个项目时，应用 MUST 发一条通知（见 desktop/notifications）：“<智能体> 创建并运行了 <名称>”，下面写地址和时间，按钮“打开”“停止”；通知 MUST NOT 把窗口提到前面，MUST NOT 切换标签页或抢走焦点。“打开”MUST 打开它的标签页（查看命令行持有的运行），“停止”MUST 停止这次运行；点按钮或卡片上的关闭后卡片收起，这一条留在通知列表的“最近”里。只创建没有运行的，MUST NOT 发通知。
来源：PRD #prd-agent-created；PRD #prd-cli-creator；PRD #prd-notifications

#### Scenario: [DESKTOP-LIBRARY-VIEW-53] 悬停看创建命令
- 前提：`react19-5` 由 Claude Code 用 `runyard new react19 react19-5 --run --note …` 创建
- **WHEN** 鼠标停在它的创建者徽标上
- **THEN** 显示创建时间和这条命令
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-54] 创建并运行时的提示不抢焦点
- 前提：应用开着，当前是 `react-counter` 的标签页，焦点在应用里
- **WHEN** 智能体执行 `runyard new react19 --run`
- **THEN** “通知”按钮下方出现卡片“Claude Code 创建并运行了 react19-5”，有地址、“打开”“停止”；当前标签页和焦点不变，窗口没有被提到前面
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-55] 从提示打开
- 前提：上一个场景的卡片还在
- **WHEN** 点“打开”
- **THEN** 出现 `react19-5` 的标签页，持有者仍是命令行，卡片收起
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-56] 只创建不提示
- **WHEN** 智能体执行 `runyard new html`（不带 `--run`）
- **THEN** 列表里出现新行，没有通知
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-102] 命令行用户自己创建并运行不当成智能体
- 前提：没有任何智能体标识的环境里，用户在命令行执行 `runyard new react19 --run`
- **WHEN** 这个项目开始运行
- **THEN** 没有“智能体创建并运行”的通知；创建者列显示“命令行”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-103] 提示里没有智能体名称时不写多余的空格
- 前提：项目的创建者是智能体，但没有记下名称
- **WHEN** 它创建并运行了项目，出现通知
- **THEN** 通知写“智能体创建并运行了 <名称>”，“智能体”和“创建”之间没有空格
- 验证：test

### Requirement: 自动清理的提醒
自动清理的项目离到期不足一天时，应用 MUST 在三处提醒，MUST NOT 发系统通知：该行“自动清理”列变成警示色的“明天清理”；一条需要处理的通知（见 desktop/notifications）“N 个项目明天会被自动清理：<名称>（已 D 天没打开）。”（多个时列出名称），按钮“关闭自动清理”“现在清理”，卡片上的关闭等于“稍后再说”；Dock 图标角标显示待清理的项目数。卡片在窗口里真正显示出来之后，应用才 MUST 回报“提醒已显示”。“关闭自动清理”MUST 把这条通知里的项目都关闭自动清理，通知、行标签和角标随之消失；“现在清理”MUST 走移到废纸篓的确认；“稍后再说”MUST 只收起卡片，这一条留在通知列表的“需要处理”里，到下次打开应用前不再弹出卡片，行标签和角标保留，清理照常按规则进行。资源库页 MUST NOT 再在表格上方显示提示条。
来源：PRD #prd-auto-clean；PRD #prd-retention；PRD #prd-decision-table（第 9 项）；PRD #prd-notifications

#### Scenario: [DESKTOP-LIBRARY-VIEW-57] 三处提醒
- 前提：`node-ts-1` 自动清理 30 天，已 29 天没打开
- **WHEN** 打开应用到资源库页
- **THEN** 它的“自动清理”列写“明天清理”；“通知”按钮下方的卡片写“1 个项目明天会被自动清理：node-ts-1（已 29 天没打开）。”；Dock 图标角标是 1；没有系统通知
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-104] 今天打开过的不写“已 0 天没打开”
- 前提：自动清理 1 天的项目，今天刚打开过，离到期不足一天
- **WHEN** 通知卡片显示
- **THEN** 写“node-ts-1（今天打开过）”，不出现“0 天”
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-58] 没显示出来就不回报
- 前提：同上，但窗口关着（应用在后台）
- **WHEN** 应用做一轮检查
- **THEN** 角标是 1，但没有回报“提醒已显示”；打开窗口、卡片出现后才回报
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-59] 关闭自动清理
- 前提：通知卡片显示着
- **WHEN** 点“关闭自动清理”
- **THEN** `node-ts-1` 的自动清理关闭（“自动清理”列写“—”），通知消失，角标消失
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-60] 稍后再说
- 前提：通知卡片显示着
- **WHEN** 点卡片上的关闭（稍后再说）
- **THEN** 卡片收起，通知列表“需要处理”里仍有这一条；该行仍写“明天清理”，角标仍是 1
- 验证：test

### Requirement: 侧栏可以收起
全局侧栏 MUST 在资源库、项目、设置和模板页面保留并可以收起：切换按钮紧跟在红绿灯右边，快捷键是 `⌃⌘S`。收起后侧栏 MUST 完全隐藏，不留窄条，内容区占满宽度；切换按钮 MUST 留在窗口里同一个位置（侧栏显示时在侧栏顶部那一行，收起后在顶栏最左边），MUST NOT 随收起或展开移动；收起时顶栏的标签条从按钮右边留出间隔后开始。空间足够时再次切换 MUST 恢复。切换项目或页面 MUST NOT 因页面类型自动隐藏侧栏或重置用户偏好；用户手动收起或展开的偏好 MUST 被记住，下次打开应用保持不变；窄窗口自动隐藏和临时展开 MUST NOT 改写此偏好，按极窄窗口规则显示。
来源：PRD #prd-library-list（负责人 2026-10-17 要求，issue #309；2026-10-18 同意方案 A；按钮位置 2026-10-18 选定方案 A，issue #391）

#### Scenario: [DESKTOP-LIBRARY-VIEW-61] 收起与展开侧栏
- 前提：窗口空间足够，资源库或项目页面，侧栏显示着
- **WHEN** 点侧栏顶部的侧栏按钮，或按 `⌃⌘S`
- **THEN** 侧栏完全隐藏，内容区占满；再点一次或再按一次，侧栏回来
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-62] 记住收起状态
- 前提：用户已手动收起侧栏
- **WHEN** 关闭后重新打开应用
- **THEN** 侧栏仍是收起的
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-66] 收起后按钮在红绿灯旁
- 前提：窗口空间足够，资源库或项目页面，侧栏显示着，侧栏按钮紧跟在红绿灯右边
- **WHEN** 点它收起侧栏，再点顶栏最左边的侧栏按钮
- **THEN** 收起后红绿灯右边是侧栏按钮，顶栏的标签条从它右边留出间隔后开始，不与它相贴；再点后侧栏回来，按钮在侧栏顶部，顶栏最左边不再有它
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-93] 收起和展开时按钮不动
- 前提：窗口空间足够，资源库或项目页面，侧栏显示着
- **WHEN** 记下侧栏按钮在窗口里的位置，收起侧栏，再展开
- **THEN** 三次看到的按钮位置相同（左边和上边都不差）；红绿灯位置也相同
- 验证：test

### Requirement: 项目标签页保留全局侧栏
项目标签页 MUST 与资源库页共用全局侧栏的展开或收起偏好；宽窗口展开时工作区 MUST 为侧栏让位，收起时工作区 MUST 使用释放的空间。项目文件树 MUST 仍位于工作区内部并独立收起。已有窄窗口自动隐藏与临时展开规则 MUST 同样适用于项目页，MUST NOT 写入手动偏好；项目页窗口不小于 1000 时临时展开的侧栏改为占位、把内容向右推（见 desktop/workspace），更窄时才覆盖内容；临时覆盖展开时侧栏 MUST NOT 被原生预览遮挡，收回后预览 MUST 恢复。侧栏分类 MUST 能直接返回相应资源库列表，不关闭项目或改变运行持有者；项目页面 MUST NOT 将资源库分类误标为当前页面。
来源：实现细节（设计稿 WebLight、Script；负责人 2026-10-17 要求，issue #309）

#### Scenario: [DESKTOP-LIBRARY-VIEW-63] 项目切换保留全局侧栏与偏好
- 前提：宽窗口，资源库侧栏展开，已有两个项目
- **WHEN** 切换到项目、在项目中收起侧栏、切换另一项目，再回到资源库
- **THEN** 切入项目仍显示侧栏，手动收起后其余页面保持收起；文件树不被连带收起，预览位置随内容区正确更新
- 验证：test

### Requirement: 点侧栏任何一项都回到资源库
点侧栏的筛选项和“模板”MUST 切到资源库页面（“模板”切到模板页）并显示结果，筛选随之生效；MUST NOT 只改筛选而停在项目标签页。“设置”是例外：点它 MUST 显示主窗口设置页面（见 desktop/settings），保留此前项目选择及其编辑、运行状态；侧栏将设置标为当前页面。
来源：PRD #prd-search-filter；PRD #prd-settings-page；负责人 2026-10-17 要求（issue #309）

#### Scenario: [DESKTOP-LIBRARY-VIEW-64] 在项目标签页点筛选
- 前提：当前是项目 `demo` 的标签页，其余项目里有 2 个“智能体创建”
- **WHEN** 点侧栏的“智能体创建”
- **THEN** 当前显示资源库页面，原项目标签及运行持有者保持不变，列表只显示 2 个智能体创建的项目，页标题是“智能体创建”
- 验证：test

### Requirement: 窗口变窄时页头和顶栏收紧
资源库页的页头放不下搜索框和三个筛选按钮时，MUST 依次收紧：搜索框先变短（最短 180 像素，占位文字只写“搜索”）；“类型”和“状态”合成一个“筛选”按钮，点开后两组选项都在里面；排序按钮只写当前的排序方式。页头连 180 像素的搜索框也放不下时，搜索框 MUST 缩成一个放大镜按钮，点它或按 `⌘F` MUST 展开成输入框并把焦点放进去；输入框为空且失去焦点后缩回放大镜。顶栏放不下完整的“N 个运行中”时 MUST 只显示圆点和数字，悬停提示仍写“N 个运行中”。窗口变宽后 MUST 恢复原样。内容区宽度小于 1180 像素时 MUST 用收紧后的窄工具条（搜索框 180、占位只写“搜索”），大于等于 1180 才用完整的搜索框加类型、状态、排序三个按钮，占位文字不得被快捷键键帽切断。
来源：PRD #prd-library-list（负责人 2026-10-18 同意方案 A）

#### Scenario: [DESKTOP-LIBRARY-VIEW-67] 1024 宽时页头收紧
- 前提：窗口宽1440的资源库页，侧栏偏好为展开，4个运行中
- **WHEN** 窗口缩到1024宽
- **THEN** 侧栏自动隐藏，页头按实际可用宽度显示搜索和筛选且不溢出；顶栏仍写完整的“4 个运行中”（不出现裸数字）；窗口改回1440后侧栏及顶栏恢复
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-106] 1100 宽收起侧栏用窄工具条
- 前提：窗口 1100 宽，侧栏已收起（内容区 1084）
- **WHEN** 查看资源库页页头
- **THEN** 搜索框宽 180、占位写“搜索”，类型和状态合成“筛选”，占位文字没有被截断
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-68] 搜索缩成放大镜后仍可用
- 前提：窗口窄到页头放不下 180 像素的搜索框，搜索框已缩成放大镜
- **WHEN** 按 `⌘F`，输入 `hono`，再清空并点表格
- **THEN** 放大镜展开成输入框，焦点在里面，列表只剩名称、备注或模板含 `hono` 的项目；清空并失去焦点后缩回放大镜，列表恢复
- 验证：test

### Requirement: 极窄窗口临时收起侧栏
当资源库窗口放不下侧栏与收列后的表格时，MUST 临时隐藏侧栏；窗口更窄时 MUST 收紧页边距及列间距，MUST 保持名称列至少 200 CSS 像素，且名称、状态、大小、自动清理与操作列完整可用，MUST NOT 横向滚动或截断必要列。窗口拉宽后 MUST 恢复对应宽度下的布局；自动适配 MUST NOT 改写用户的侧栏偏好。侧栏自动隐藏时，原切换按钮与快捷键 MUST 仍可临时展开侧栏，展开的侧栏覆盖内容而不挤窄表格；再次切换、按 Esc 或选择分类后 MUST 收回，选择分类仍按原规则生效；设置在主窗口内容区显示，收回覆盖侧栏后保留顶部项目与资源库返回入口（见 desktop/settings）。若通过临时侧栏进入模板页，MUST 保留原侧栏切换入口可用，侧栏开合 MUST NOT 改换页面。自动隐藏时表格或搜索框里的焦点 MUST 保持；焦点若在被隐藏的侧栏里 MUST 移到切换按钮；通过键盘或快捷键临时展开时焦点 MUST 进入当前分类，用鼠标点开时焦点 MUST 留在切换按钮、不出现焦点环；项目页面没有当前分类时 MUST 聚焦侧栏第一项，关闭后 MUST 返回切换按钮。
来源：PRD #prd-library-list；PRD #prd-search-filter

#### Scenario: [DESKTOP-LIBRARY-VIEW-97] 极窄窗口保持必要列完整
- 前提：手动偏好为展开侧栏，资源库包含长名称、较长状态和大小数据，分别使用中文和英文
- **WHEN** 窗口内容视口宽度依次为 1024、900、720 CSS 像素
- **THEN** 侧栏临时隐藏；名称列至少 200 CSS 像素，必要列及操作不被截断，表格没有横向溢出，页头按实际空间收紧且不溢出；搜索和表格内已有焦点保持，原在侧栏内的焦点移到侧栏切换按钮
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-98] 拉宽恢复布局但不改手动偏好
- 前提：分别从用户手动展开、手动收起的侧栏偏好开始
- **WHEN** 将窗口从 1440 缩到 720，再拉到 1100、1440，并重新打开应用
- **THEN** 手动展开时侧栏在极窄窗口临时隐藏、1100 时恢复场景 28 的收列布局、1440 时恢复宽版；手动收起时拉宽仍收起，自动适配及重开应用不改写原偏好
- 验证：test

#### Scenario: [DESKTOP-LIBRARY-VIEW-99] 自动隐藏后仍可使用侧栏
- 前提：分别在资源库和项目页面，窗口宽 720，侧栏因空间不足临时隐藏
- **WHEN** 分别通过原切换按钮和快捷键打开侧栏，选择分类、再次切换或按 Esc 关闭
- **THEN** 侧栏临时覆盖内容，表格宽度不变；打开后焦点进入当前分类，项目页无当前分类时进入第一项；项目原生预览不得遮挡侧栏，收回后预览恢复；分类筛选生效后侧栏收回；关闭后焦点回到切换按钮，原手动偏好保持不变
- 验证：test
