# playgrounds Specification

## Purpose

约定项目（playground）怎样创建、命名、改名、移到废纸篓，以及文件夹在应用外被动过时怎么办。名称既是显示名也是文件夹名，所以名称规则同时要保证资源库能搬到 Windows。用户的项目是资产：任何情形下都不做永久删除，平台层的“移到废纸篓”放不进就失败并说明原因。自动清理的计时和提醒在 library/auto-clean。

## Requirements

### Requirement: 从模板创建项目
创建项目 MUST 把模板文件复制到资源库根目录下以名称命名的文件夹，写入 `.runyard/playground.json`（含不变的 `id`、模板、创建者、备注、自动清理开关），分配端口（服务类），并登记到索引。创建后项目 MUST 默认不开启自动清理。运行失败 MUST NOT 使创建失败。
来源：PRD #prd-create；PRD #prd-note；PRD #prd-agent-created；PRD #prd-cli-clean-after

#### Scenario: [LIBRARY-PLAYGROUNDS-01] 命令行创建
- 前提：资源库根目录是空的临时目录
- **WHEN** 执行 `runyard new react19 pricing-table --note "pricing table layout test" --json`
- **THEN** 资源库下出现 `pricing-table` 文件夹，里面有模板文件和 `.runyard/playground.json`；结果带绝对路径、`id`、`created: true`、`retention: "kept"`
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-02] 记录创建者
- 前提：环境变量 `RUNYARD_AGENT` 为 `Claude Code`
- **WHEN** 执行 `runyard new` 创建项目
- **THEN** `playground.json` 的创建者种类是智能体、名字是 `Claude Code`，并记下创建命令和备注
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-03] 创建成功但运行失败
- 前提：模板需要的工具本机没有
- **WHEN** 执行 `runyard new <模板> --run`
- **THEN** 项目已创建且可编辑，运行失败，错误码 `TOOL_MISSING`，退出码 4
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-04] 已存在时复用
- 前提：已有名为 `demo` 的项目
- **WHEN** 执行 `runyard new <模板> demo --if-exists reuse`
- **THEN** 返回已有项目，`created: false`，不新建、不覆盖文件；改用 `--if-exists fail` 时报 `NAME_EXISTS`，退出码 9
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-05] 路径接近长度上限
- 前提：资源库路径加名称接近系统路径长度上限
- **WHEN** 创建项目
- **THEN** 结果里带路径过长的警告提示，创建仍然进行
- 验证：test

### Requirement: 默认名称是模板标识加序号
没有给名称时，系统 MUST 用“模板标识加序号”命名；序号 MUST 取现有同模板同名项目中最大的序号加一，MUST NOT 回头补空缺。
来源：PRD #prd-naming；PRD #prd-decision-table

#### Scenario: [LIBRARY-PLAYGROUNDS-06] 取最大序号加一
- 前提：已有 `react19-1` 和 `react19-3`
- **WHEN** 不给名称创建 `react19` 项目
- **THEN** 新项目叫 `react19-4`
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-07] 删除后序号不复用
- 前提：曾有 `react19-1` 和 `react19-2`，其中 `react19-2` 已移到废纸篓，现存只有 `react19-1`
- **WHEN** 不给名称再创建 `react19` 项目
- **THEN** 新项目叫 `react19-2`（取现存最大序号加一，不记住已删除的序号）
- 验证：test

### Requirement: 名称规则
名称 MUST 只含小写字母、数字、连字符，最长 64 个字符，首尾 MUST NOT 是连字符。Windows 保留名（`con`、`prn`、`aux`、`nul`、`com1` 到 `com9`、`lpt1` 到 `lpt9`，带扩展名的同样）MUST 在所有系统上被拒绝。末尾是点或空格的名称 MUST 被拒绝。已有同名项目 MUST 报 `NAME_EXISTS`。校验 MUST 在产生任何副作用（停止运行、改文件夹）之前完成。
来源：PRD #prd-naming；PRD #prd-decision-table；ADR 0010

#### Scenario: [LIBRARY-PLAYGROUNDS-08] 长度边界
- **WHEN** 分别用 64 个字符和 65 个字符的合法名称创建
- **THEN** 64 个字符的创建成功；65 个字符的报 `NAME_INVALID`，退出码 2
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-09] 非法字符和连字符位置
- **WHEN** 用 `My App`、`demo_1`、`-demo`、`demo-` 创建
- **THEN** 全部报 `NAME_INVALID`
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-10] Windows 保留名在所有系统上被拒绝
- **WHEN** 在 macOS 上用 `con`、`nul`、`com1`、`lpt9` 创建项目
- **THEN** 全部报 `NAME_RESERVED`，没有创建任何文件夹
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-11] 末尾的点或空格
- **WHEN** 用以点或空格结尾的名称创建
- **THEN** 报 `NAME_INVALID`，没有创建任何文件夹
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-12] 重名
- 前提：已有 `demo`
- **WHEN** 再用 `demo` 创建
- **THEN** 报 `NAME_EXISTS`，参数 `{ name: 'demo' }`，已有项目不变
- 验证：test

### Requirement: 重命名
重命名 MUST 先校验新名称；正在 `installing` 或 `starting` 的项目 MUST 拒绝（`BUSY`）。重命名一个正在运行的项目 MUST 先停止、改名，再用新名称启动，持有者不变。重命名 MUST NOT 改变端口和其他设置。改名前 MUST 先让所有已连接的客户端释放该项目的句柄，最多等 3 秒，超时的客户端 MUST 只记一行日志后继续。平台层的改名因文件夹被占用或权限不足而失败（`EBUSY`、`EPERM`、`EACCES`）时 MUST 返回 `PATH_LOCKED`，且文件夹 MUST 保持原名。
来源：PRD #prd-rename；PRD #prd-failure-states；ADR 0010

#### Scenario: [LIBRARY-PLAYGROUNDS-13] 改名到保留名
- 前提：项目 `demo` 正在运行
- **WHEN** 重命名为 `nul`
- **THEN** 报 `NAME_RESERVED`；运行没有被停止，文件夹名没变
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-14] 改名正在运行的项目
- 前提：`demo` 由命令行持有，在端口 7104 `ready`
- **WHEN** 重命名为 `demo2`
- **THEN** 旧运行被停止，文件夹改名，随后用新名称自动启动，持有者仍是命令行，端口仍是 7104
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-15] 安装中不能改名
- 前提：项目处于 `installing`
- **WHEN** 重命名
- **THEN** 报 `BUSY`，退出码 9，没有任何改动
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-16] 客户端不回报释放
- 前提：一个已连接的客户端收到 `releaseRequested` 后一直不回报
- **WHEN** 重命名
- **THEN** 管理进程等满 3 秒后继续，记一行日志；改名在没有该客户端回报的情况下进行
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-17] 客户端回报后立即继续
- 前提：所有已连接的客户端都回报了释放
- **WHEN** 重命名
- **THEN** 不再等满 3 秒，立即继续
- 验证：test

### Requirement: 移到废纸篓
`rm` 与自动清理 MUST 先停止运行并走与改名相同的释放顺序，再只通过平台层的“移到废纸篓”完成；MUST NOT 以任何方式永久删除用户的项目。MUST NOT 覆盖废纸篓里的同名项目。平台层的“移到废纸篓”失败时 MUST 返回 `TRASH_UNAVAILABLE`，项目文件夹 MUST 原样保留，MUST NOT 退到永久删除。
来源：PRD #prd-retention；PRD #prd-script-projects；ADR 0010

#### Scenario: [LIBRARY-PLAYGROUNDS-19] 正常移到废纸篓
- 前提：`demo` 正在运行
- **WHEN** 执行 `runyard rm demo`
- **THEN** 运行先被停止，文件夹出现在废纸篓里，资源库里不再有 `demo`
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-20] 废纸篓里已有同名项目
- 前提：废纸篓里已有一个叫 `demo` 的文件夹
- **WHEN** 把另一个 `demo` 移到废纸篓
- **THEN** 两个都在废纸篓里，先前那个没有被覆盖
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-24] 没有任何途径做永久删除
- **WHEN** 检查资源库代码和命令行代码
- **THEN** 其中没有 `fs.rm`、`rmSync`、`rmdir` 一类的永久删除调用
- 验证：test

### Requirement: 文件夹在应用外被动过
管理进程 MUST 在启动时和资源库根目录发生变化时扫描：同一个 `id` 出现在别处的，MUST 按 `id` 认回并更新路径，端口和设置 MUST 不变；索引里的路径不在、找不到同一个 `id` 的，MUST 标记 `missingSince` 并显示“找不到文件夹”；同 `id` 的文件夹被复制出另一份的，MUST 给多出来的那份换新 `id` 和新端口。对找不到文件夹的项目运行或移到废纸篓 MUST 报 `FOLDER_MISSING`。
来源：PRD #prd-decision-table；PRD #prd-auto-clean

#### Scenario: [LIBRARY-PLAYGROUNDS-26] 在访达里改了名
- 前提：项目 `demo` 登记端口 7104；用户在应用外把文件夹改名为 `demo-new`
- **WHEN** 管理进程扫描
- **THEN** 项目按 `id` 认回，名称显示 `demo-new`，端口仍是 7104，设置不变，发出 `playground.changed`
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-27] 文件夹被移走
- 前提：项目的文件夹被移出资源库且找不到同一个 `id`
- **WHEN** 管理进程扫描
- **THEN** 项目标记 `missingSince`，发出 `playground.missing`；`runyard run <名称>` 报 `FOLDER_MISSING`，退出码 3
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-28] 重新定位
- 前提：项目处于找不到文件夹状态，用户把文件夹放到了别处
- **WHEN** 对它执行重新定位，指向那个文件夹，里面的 `id` 对得上
- **THEN** 项目恢复，`missingSince` 清除，端口和设置不变
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-29] 在文件管理器里复制了项目
- 前提：用户在应用外复制了一份项目文件夹，两份的 `id` 相同
- **WHEN** 管理进程扫描
- **THEN** 路径与索引一致的那份保留 `id`，另一份换新 `id` 和新端口
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-30] 索引丢失后重建
- 前提：`library.json` 被删除
- **WHEN** 管理进程启动
- **THEN** 资源库里每个带 `.runyard/playground.json` 的文件夹都被重新登记，端口重新分配，`lastUsedAt` 取当前时间
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-31] 平台层移到废纸篓失败
- 前提：测试用的假平台让 `fs.trash` 失败（不管原因）
- **WHEN** 执行 `rm`
- **THEN** 报 `TRASH_UNAVAILABLE`，退出码 9；没有任何内容被永久删除，项目仍在资源库里
- 验证：test

#### Scenario: [LIBRARY-PLAYGROUNDS-32] 平台层改名失败
- 前提：测试用的假平台让 `fs.moveDir` 以 `EACCES` 失败
- **WHEN** 重命名
- **THEN** 报 `PATH_LOCKED`，退出码 9；文件夹仍叫原名，内容完好
- 验证：test
