# desktop/library-view Specification

## Purpose
约定桌面应用资源库首页的列表与基本操作：每个项目一行，显示名称与备注、状态、模板、端口、保留、上次打开、创建者，运行中的排在最前；已停止的项目主操作是“打开”（打开即运行），运行中的是“停止运行”。本批只规定列表和最基本的操作，搜索筛选与其余菜单项放到后续批次。

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
