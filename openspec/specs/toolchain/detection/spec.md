# detection Specification

## Purpose

约定系统怎样判断一个项目用得到的工具有没有装、版本合不合适，以及图形应用拿不到终端环境时怎样读取用户的真实环境。只在创建或打开项目时检查它用得到的工具；系统只提示、不代为安装；环境解析慢或失败时界面不被阻塞，并明确告知结果可能不准。

## Requirements

### Requirement: 只在用到时检查，且不代为安装
系统 MUST 只在创建或打开项目时检查这个项目用得到的工具，MUST NOT 在首次启动时检查。模板选择器读取检测结果时 MUST 只读缓存，MUST NOT 触发检测。系统 MUST NOT 代为安装任何工具，运行时 MUST 关闭 uv 和 Go 的自动下载。
来源：PRD #prd-missing-runtime-prompt；PRD #prd-runtime-requirements

#### Scenario: [TOOLCHAIN-DETECTION-01] 创建用不到某工具的项目
- 前提：本机没有 Go
- **WHEN** 创建并运行 `html` 或 `react19` 项目
- **THEN** 没有检测 Go，也没有关于 Go 的任何提示
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-02] 只读缓存的检测请求
- 前提：缓存里没有 Python 的结果
- **WHEN** 以 `cachedOnly: true` 请求检测
- **THEN** 不执行任何版本命令，该工具的结果为空
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-03] 工具缺失时不安装
- 前提：项目需要 Go，本机没有
- **WHEN** 启动该项目
- **THEN** 报 `TOOL_MISSING`；系统没有执行任何安装命令；子进程环境里 uv 和 Go 的自动下载被关闭
- 验证：test

### Requirement: 只有执行版本命令并解析出版本号才算找到
一个工具 MUST 只有在执行它的版本命令并解析出版本号后才算“已找到”；Go 的版本命令 MUST 是 `go version`，其余工具是 `--version`。
来源：PRD #prd-runtime-requirements；PRD #prd-failure-states

#### Scenario: [TOOLCHAIN-DETECTION-04] 能解析出版本号
- 前提：PATH 上有 Node，`--version` 输出 `v24.21.0`
- **WHEN** 检测 Node
- **THEN** 结果是已找到，版本 `24.21.0`，带真实路径
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-05] 文件存在但版本命令失败
- 前提：PATH 上有一个同名文件，执行版本命令失败或输出解析不出版本号
- **WHEN** 检测该工具
- **THEN** 判为未找到
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-06] Go 用 go version
- 前提：Go 的 `go version` 输出 `go version go1.26.0 darwin/arm64`
- **WHEN** 检测 Go
- **THEN** 版本是 `1.26.0`，检测过程没有执行 `go --version`
- 验证：test

### Requirement: 版本范围的判定
低于模板 `requires` 下限 MUST 拦住并报 `TOOL_TOO_OLD`（参数含要求的范围和当前版本）；高于上限 MUST 照常运行并给“未经测试”的提醒；缺少且有 `fallback` 的工具（pnpm 缺则用 npm）MUST NOT 算失败，MUST 在输出里说明一行并给提示。
来源：PRD #prd-runtime-requirements；PRD #prd-failure-states

#### Scenario: [TOOLCHAIN-DETECTION-08] 版本低于下限
- 前提：模板要求 Node `>=20.19 <27`，本机是 20.10.0
- **WHEN** 启动项目
- **THEN** 报 `TOOL_TOO_OLD`，参数含工具名、要求的范围和 `20.10.0`；命令行退出码 4
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-09] 版本高于上限
- 前提：同上，本机是 28.0.0
- **WHEN** 启动项目
- **THEN** 照常运行，结果带“未经测试”的提醒，不是错误
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-10] 没有 pnpm 回退 npm
- 前提：本机有 npm，没有 pnpm
- **WHEN** 启动一个需要 pnpm 或 npm 的项目
- **THEN** 用 npm 安装依赖，运行日志里有一条说明“已改用 npm”的结构化提示；不报错
- 验证：test

### Requirement: 手动指定的路径优先
设置里用户手动指定的工具路径 MUST 排在所有自动查找之前；之后依次是用户登录环境的 `PATH`、一组常见安装目录。
来源：PRD #prd-settings-toolchain；PRD #prd-failure-states

#### Scenario: [TOOLCHAIN-DETECTION-11] 指定路径覆盖自动找到的
- 前提：PATH 上有 Node 20，设置里为 Node 指定了另一份 Node 24
- **WHEN** 检测 Node
- **THEN** 使用的是指定的 Node 24
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-12] 重新检测后生效
- 前提：用户刚装好工具，或刚指定了路径
- **WHEN** 执行重新检测
- **THEN** 缓存被清空，重新解析环境并重新查找，使用新的结果
- 验证：test

### Requirement: macOS 上通过登录 shell 读取用户的真实环境
macOS 上，从访达启动的应用拿不到终端里的环境，系统 MUST 向用户的登录 shell 要环境：登录加交互，在随机的起止标记之间输出环境，输入为空，进程自成一组，硬超时 10 秒，看到结束标记就结束这一组。检测命令和读取环境 MUST 以项目文件夹为工作目录。结果 MUST 按（登录 shell、启动文件修改时间；项目里有版本文件时再加项目路径和这些文件的修改时间）缓存，缓存 1 小时有效，应用启动和重新检测时 MUST 在后台刷新，界面 MUST NOT 等待。
来源：ADR 0009；PRD #prd-settings-toolchain

#### Scenario: [TOOLCHAIN-DETECTION-13] 读到终端里才有的工具
- 前提：Node 只由终端里的版本管理器（如 nvm）提供，应用的进程环境里没有
- **WHEN** 在 macOS 上检测 Node
- **THEN** 通过登录 shell 读到的环境找到该 Node，来源标记为 `login-shell`
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-14] 以项目文件夹为工作目录
- 前提：项目里有 `.node-version`，指定了与全局不同的版本，版本垫片按工作目录选版本
- **WHEN** 检测该项目的 Node
- **THEN** 得到的是项目指定的版本，而不是全局版本
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-15] 解析超时给出降级结果
- 前提：用户的启动文件里有 `sleep` 使登录 shell 超过 10 秒才返回
- **WHEN** 检测工具
- **THEN** 10 秒时硬超时并结束这一组进程；先用常见目录扫描的结果顶着，发出 `ENV_UNRESOLVED`（带原因），后台再试一次；调用方在这期间没有被阻塞
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-16] 只读到非交互环境
- 前提：交互方式都失败，只有非交互登录方式读到环境
- **WHEN** 检测工具
- **THEN** 结果来源标为 `login-shell-degraded`，发出 `ENV_DEGRADED`
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-17] 不能解析的 shell
- 前提：用户的登录 shell 是 nu 或 tcsh
- **WHEN** 检测工具
- **THEN** 不尝试解析，直接用常见目录扫描的结果，来源标为 `fallback`
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-18] 缓存期间界面不等待
- 前提：缓存已过期
- **WHEN** 请求检测
- **THEN** 立即返回旧值，同时在后台刷新；刷新完成后发出 `toolchain.changed`
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-19] 往已有目录装了新工具不用重新解析
- 前提：环境已缓存，用户往 PATH 已有的目录里装了一个新工具
- **WHEN** 检测这个新工具
- **THEN** 版本命令和查找每次实时执行，无需重新解析环境就能找到
- 验证：test

#### Scenario: [TOOLCHAIN-DETECTION-20] 解析结果与扫描不一致
- 前提：登录 shell 解析成功，其结果与常见目录扫描的结果不同
- **WHEN** 检测工具
- **THEN** 以解析结果为准；扫描只在解析失败时作为临时答案，并标明来源
- 验证：test
