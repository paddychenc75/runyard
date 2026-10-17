# desktop/create-flow Specification

## Purpose
约定桌面应用里从打开应用到创建出第一个项目并开始运行的行为：首次启动直接进入模板选择器，选好模板后弹出新建弹窗，名称、备注、自动清理三项都有默认值，所以回车即建即运行。缺少运行环境只在用到时提醒，不做环境检查页。

## Requirements

### Requirement: 首次启动直接进入模板选择器
资源库里没有任何项目时，应用首次启动 MUST 直接显示模板选择器，MUST NOT 显示环境检查页，MUST NOT 因为本机缺少某种工具而阻止选择任何模板。
来源：PRD #prd-first-run

#### Scenario: [DESKTOP-CREATE-FLOW-01] 空资源库首次启动
- 前提：资源库根目录是空的临时目录，本机没有 node、python、go
- **WHEN** 打开应用
- **THEN** 显示模板选择器，没有环境检查页；静态页面模板（`html`）可以选择并创建
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-02] 缺工具的模板照常显示可选
- 前提：本机没有某个模板需要的工具，且该工具还没有检测过
- **WHEN** 打开模板选择器
- **THEN** 该模板照常显示、可以选中；选择器本身不触发工具检测
- 验证：test

### Requirement: 模板选择器的打开与选择
`⌘N` MUST 打开模板选择器且焦点落在搜索框；默认视图顶部 MUST 是“最近使用”分组，其后才是按类型的分组；选中模板后按回车 MUST 进入新建弹窗。第一版的选择器 MUST 只列出本机已有的模板。
来源：PRD #prd-template-picker；PRD #prd-failure-states

#### Scenario: [DESKTOP-CREATE-FLOW-03] 用快捷键打开
- 前提：应用在资源库页
- **WHEN** 按 `⌘N`
- **THEN** 出现模板选择器，焦点在搜索框里
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-04] 最近使用排在最前
- 前提：用户最近用 `vue3` 创建过项目
- **WHEN** 打开模板选择器
- **THEN** 第一个分组是“最近使用”，里面有 `vue3`，其后才是按类型的分组
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-05] 回车进入新建弹窗
- 前提：选择器里选中了 `react19`
- **WHEN** 按回车
- **THEN** 选择器关闭，出现新建弹窗，弹窗里的模板是 `react19`
- 验证：test

### Requirement: 新建弹窗的三项和默认值
选好模板后 MUST 弹出新建弹窗，含名称、备注、自动清理三项，三项都有默认值。名称默认 MUST 是“模板标识加序号”，序号取现有同名项目中最大序号加一，不回头补空缺；打开时 MUST 全选。备注 MUST 可以不填。自动清理 MUST 默认关闭，打开后才出现天数选择（7 天、30 天、90 天或自定义）。
来源：PRD #prd-create-dialog；PRD #prd-naming；PRD #prd-note；PRD #prd-auto-clean

#### Scenario: [DESKTOP-CREATE-FLOW-06] 默认名称取最大序号加一
- 前提：资源库里已有 `react19-1` 和 `react19-3`
- **WHEN** 选 `react19` 打开新建弹窗
- **THEN** 名称默认是 `react19-4` 且被全选
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-07] 自动清理默认关闭
- **WHEN** 打开新建弹窗
- **THEN** 自动清理是关闭的，天数选择收起；备注为空
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-08] 打开自动清理后选天数
- 前提：新建弹窗已打开
- **WHEN** 打开自动清理
- **THEN** 出现 7 天、30 天、90 天和自定义的选择；选 30 天创建后，该项目的保留列显示“剩 30 天”
- 验证：test

### Requirement: 名称的行内校验
名称不合法或与现有项目重名时，弹窗 MUST 在名称下显示行内错误，并 MUST NOT 创建。重名的错误文字是“这个名字已被占用”。名称规则与命令行一致：小写字母、数字、连字符，最长 64 个字符，首尾不是连字符。
来源：PRD #prd-naming

#### Scenario: [DESKTOP-CREATE-FLOW-09] 重名
- 前提：资源库里已有 `demo`
- **WHEN** 在名称里填 `demo` 并按回车
- **THEN** 名称下显示“这个名字已被占用”，没有创建项目，弹窗不关闭
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-10] 不合法的字符
- **WHEN** 在名称里填 `My App`
- **THEN** 名称下显示行内错误，没有创建项目
- 验证：test

### Requirement: 回车即建即运行
新建弹窗里按回车 MUST 创建项目并开始运行，持有者是这个标签页；在备注里用输入法时，回车是确认候选词，MUST NOT 触发创建。取消 MUST 不创建任何东西。
来源：PRD #prd-create-dialog；PRD #prd-run-ownership

#### Scenario: [DESKTOP-CREATE-FLOW-11] 直接回车
- 前提：新建弹窗保持全部默认值
- **WHEN** 按回车
- **THEN** 创建项目、打开它的标签页并开始运行，持有者是这个标签页；创建出的项目是“已保留”
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-12] 备注里的输入法回车
- 前提：焦点在备注，输入法正在组词
- **WHEN** 按回车确认候选词
- **THEN** 不创建项目，弹窗保持打开
- 验证：manual（自动化测试里无法可靠模拟系统输入法的组词状态）

#### Scenario: [DESKTOP-CREATE-FLOW-13] 取消
- **WHEN** 在新建弹窗里取消
- **THEN** 弹窗关闭，资源库里没有新增项目
- 验证：test

### Requirement: 创建后立即打开工作区并显示启动进度
创建后工作区 MUST 立即打开；预览区 MUST 依次显示复制、安装、启动、就绪，并附带实时日志行，直到结果出现。运行失败 MUST NOT 使创建失败，项目始终保持可编辑。
来源：PRD #prd-create；PRD #prd-failure-states

#### Scenario: [DESKTOP-CREATE-FLOW-14] 创建后的启动进度
- 前提：用 `react19` 模板创建
- **WHEN** 创建开始
- **THEN** 工作区立即打开，预览区依次显示复制、安装、启动、就绪，并滚动显示日志行；就绪后显示页面
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-15] 创建成功但运行失败
- 前提：模板需要的工具本机没有
- **WHEN** 创建并运行
- **THEN** 项目已出现在资源库里，工作区显示缺少运行环境的画面，不是创建失败
- 验证：test

### Requirement: 缺少运行环境只在用到时提醒
只有在用户选定某个模板创建项目、或打开已有项目时，应用才 MUST 检查这个项目需要的工具；用不到的工具缺不缺 MUST NOT 打扰用户。
来源：PRD #prd-missing-runtime-prompt

#### Scenario: [DESKTOP-CREATE-FLOW-16] 用不到的工具缺失不打扰
- 前提：本机没有 python，用户只创建并运行 `html` 模板
- **WHEN** 创建并运行
- **THEN** 没有任何关于 python 的提示
- 验证：test

### Requirement: 模板选择器里的搜索
模板选择器的搜索框输入文字后 MUST 只留下名称、标识或说明里含有这段文字的模板（不分大小写），仍按类型分组，“最近使用”分组在搜索时 MUST 不显示；第一个结果 MUST 自动选中，上下方向键移动，回车进入新建弹窗。一个也没有时 MUST 写明没有匹配的模板。清空搜索 MUST 回到默认视图。
来源：PRD #prd-template-picker；PRD #prd-search-filter

#### Scenario: [DESKTOP-CREATE-FLOW-17] 按名称和说明匹配
- 前提：本机有内置的 `react19`、`react18`、`vue3`、`hono` 等模板
- **WHEN** 在选择器的搜索框输入 `react`
- **THEN** 只剩 React 19 和 React 18 两个模板，没有“最近使用”分组，第一个被选中
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-18] 搜索后回车
- 前提：搜索 `hono` 后只剩 Hono
- **WHEN** 按回车
- **THEN** 出现新建弹窗，模板是 `hono`
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-19] 没有匹配
- **WHEN** 搜索 `rails`
- **THEN** 列表为空并写明没有匹配的模板；清空搜索后回到带“最近使用”的默认视图
- 验证：test

### Requirement: 创建时的两条提醒
资源库文件夹在 iCloud、Dropbox 这类网盘同步目录下时，新建弹窗 MUST 显示一条警告，说明同步可能拖慢依赖安装或让文件被临时锁住；不在同步目录下时 MUST NOT 显示。创建成功但项目路径接近系统长度上限时，MUST 在右下角显示一条只能关闭的提示，写明项目名、路径长度和上限；创建 MUST 照常完成。
来源：PRD #prd-create-dialog；PRD #prd-failure-states

#### Scenario: [DESKTOP-CREATE-FLOW-20] 资源库在同步目录下
- 前提：资源库文件夹在网盘同步目录下
- **WHEN** 打开新建弹窗
- **THEN** 弹窗里有一条关于网盘同步目录的警告，仍可正常创建；资源库不在同步目录下时没有这条警告
- 验证：test

#### Scenario: [DESKTOP-CREATE-FLOW-21] 路径接近长度上限的提示
- 前提：创建的项目路径接近系统长度上限
- **WHEN** 创建成功
- **THEN** 项目照常创建，右下角出现提示，写明项目名、路径字符数和上限，只有关闭按钮；关闭后提示消失
- 验证：test
