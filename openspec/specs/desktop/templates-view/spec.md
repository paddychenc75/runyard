# desktop/templates-view Specification

## Purpose
约定桌面应用里和模板有关的两块界面：侧栏“模板”打开的模板页（只读的列表和详情，可以“用它新建”和“在访达中显示”），以及资源库行和工作区“更多”菜单里的“另存为模板”弹窗。另存和手写模板本身的规则（标识、哪些文件进模板、变量替换）在 templates/custom，本规格只管界面看得见的部分。

## Requirements

### Requirement: 模板页的列表
点侧栏“模板”MUST 打开模板页，模板页 MUST NOT 有顶栏。页标题“模板”下 MUST 写“N 个内置 · M 个我的”；列表 MUST 按类型分组（页面、前端、全栈、脚本、服务），用户自己的模板单独放在最后的“我的”分组；每行写图标、名称、一句说明，右侧标“内置”或“我的”。无效的用户模板 MUST 也列出，标明无效和原因，MUST NOT 能用来新建。手写模板放进约定位置后，再次打开模板页 MUST 能看到它，不用重启应用。
来源：PRD #prd-save-as-template；PRD #prd-library-list；PRD #prd-decision-table（第 15 项）

#### Scenario: [DESKTOP-TEMPLATES-VIEW-01] 打开模板页
- 前提：本机有 9 个内置模板和 2 个用户模板
- **WHEN** 点侧栏“模板”
- **THEN** 显示模板页，没有顶栏；标题下写“9 个内置 · 2 个我的”；最后一个分组是“我的”，里面两行标“我的”
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-02] 无效的用户模板
- 前提：一个用户模板的 `template.json` 校验不通过
- **WHEN** 打开模板页
- **THEN** 它在“我的”分组里，标明无效并写出原因；它的“用它新建”不可点
- 验证：test

### Requirement: 模板详情
选中一个模板 MUST 在右侧显示详情：名称、标识、标签；“依赖的运行环境”表（工具、需要的版本、这台电脑上的版本、是否满足），这台电脑的版本只用已有的检测结果，没检测过的留空，打开详情 MUST NOT 触发检测；有可替代的辅助工具时写回退说明（如“没有 pnpm 时会改用 npm”）；“运行方式”（安装依赖、启动、就绪判断）；“包含的文件”树。底部 MUST 有“用它新建”和“在访达中显示”，以及说明“想改内置模板：先用它新建一个项目，改好后“另存为模板”。”。MUST NOT 有编辑、删除、复制为自己的模板。
来源：PRD #prd-save-as-template；PRD #prd-missing-runtime-prompt；PRD #prd-decision-table（第 15 项）

#### Scenario: [DESKTOP-TEMPLATES-VIEW-03] 查看详情
- 前提：本机检测过 node 和 pnpm
- **WHEN** 在模板页选中 React 19
- **THEN** 详情写出标识 `react19`、运行环境表（node、pnpm 各一行，含需要的版本、本机版本和“满足”）、安装和启动命令、文件树；没有编辑和删除按钮
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-04] 没检测过的工具留空
- 前提：本机从没检测过 go
- **WHEN** 选中 Go 模板
- **THEN** “这台电脑”一列留空，没有触发检测
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-05] 用它新建
- **WHEN** 在 React 19 的详情里点“用它新建”
- **THEN** 出现新建弹窗，模板是 `react19`
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-06] 在访达中显示
- **WHEN** 在一个用户模板的详情里点“在访达中显示”
- **THEN** 访达打开并选中这个模板的文件夹
- 验证：manual（访达是系统程序，自动化测试里只能断言应用发出了请求）

### Requirement: 另存为模板弹窗
资源库行和工作区“更多”菜单里的“另存为模板…”MUST 打开弹窗：标题“另存为模板”，说明“把 <项目名> 现在的样子存成模板，以后新建时可以直接用。”；字段“模板名称”“模板标识”（下面说明“只能用小写字母、数字和连字符，命令行里用它：runyard new <标识>”）、“说明”；“包含的文件”是带勾选框的文件树，默认不包含的（依赖目录、`.env`、构建产物）单独放在“默认不包含”下并写明原因；“依赖的运行环境”一行写“沿用原模板 <模板>：<要求>”；开关“把项目名替换成变量，新建时自动换成新项目的名字”，默认开；底部写“保存后出现在新建时的“我的”分组 · <保存位置>”，按钮“取消”“保存模板”。标识 MUST 行内校验，不合法或已被占用时写明原因且不能保存。保存成功后新模板 MUST 立即出现在模板选择器的“我的”分组和模板页里；保存失败 MUST 写明原因，MUST NOT 留下半个模板，原项目 MUST NOT 被改动。
来源：PRD #prd-save-as-template；PRD #prd-workspace-menu

#### Scenario: [DESKTOP-TEMPLATES-VIEW-07] 弹窗的默认内容
- 前提：项目 `hono-todo-api`（模板 Hono）里有 `src/`、`package.json`、`node_modules/`、`.env`、`dist/`
- **WHEN** 在它的更多菜单里选“另存为模板…”
- **THEN** 弹窗里 `src/`、`package.json` 已勾选；`node_modules/`、`.env`、`dist/` 在“默认不包含”下未勾选并写明原因；运行环境写沿用 Hono；变量开关是开的
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-08] 标识已被占用
- 前提：已有用户模板 `todo-api`
- **WHEN** 模板标识填 `todo-api`
- **THEN** 标识下写明已被占用，“保存模板”不可点
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-09] 保存后立即可用
- **WHEN** 填好名称“待办接口起步”、标识 `todo-api` 并点“保存模板”
- **THEN** 弹窗关闭；按 `⌘N` 打开选择器，“我的”分组里有它；模板页里也有它
- 验证：test

#### Scenario: [DESKTOP-TEMPLATES-VIEW-10] 勾上 .env
- **WHEN** 在“默认不包含”里勾上 `.env` 再保存
- **THEN** 新模板里有 `.env`
- 验证：test
