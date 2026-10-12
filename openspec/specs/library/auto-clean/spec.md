# auto-clean Specification

## Purpose

约定项目的“已保留”和“自动清理”：默认什么都不删，demo 是用户的资产；只有用户明确打开了自动清理的项目，超过所选天数没有使用，才会在应用里先提醒、再移到废纸篓。本规格约定什么算一次使用、什么时候提醒、什么时候才真的清理、哪些情形必须跳过或顺延。清理只通过平台层的“移到废纸篓”，可以恢复，没有永久删除；创建、命名、移到废纸篓本身的细节在 library/playgrounds。界面上的标签、提示条和 Dock 图标角标属于桌面应用，不在这里。

## Requirements

### Requirement: 默认已保留，自动清理由用户明确打开
每个项目 MUST 要么“已保留”，要么“自动清理”（带天数）。创建时没有明确打开自动清理的项目 MUST 是“已保留”，包括智能体经命令行创建的项目；命令行只有带 `--clean-after <N>d`（N 为正整数）才 MUST 开启自动清理。之后 MUST 能随时在两种之间切换。“已保留”的项目 MUST NOT 被提醒，也 MUST NOT 被清理，无论多久没有使用。`--clean-after` 的值不是“正整数加 `d`”的 MUST 报 `USAGE`，MUST NOT 创建项目。
来源：PRD #prd-auto-clean；PRD #prd-retention；PRD #prd-cli-clean-after；PRD #prd-agent-created

#### Scenario: [LIBRARY-AUTO-CLEAN-01] 默认已保留
- **WHEN** 执行 `runyard new react19 demo --json`
- **THEN** 结果里 `retention` 是 `"kept"`；这个项目的 `autoClean.enabled` 为 `false`
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-02] 创建时打开自动清理
- **WHEN** 执行 `runyard new react19 demo --clean-after 30d --json`
- **THEN** 项目的 `autoClean` 是开、30 天；结果里 `retention` 是 `"autoClean"`
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-03] 写法不对的天数
- **WHEN** 分别用 `--clean-after 30`、`--clean-after 0d`、`--clean-after -1d`、`--clean-after 2w` 创建
- **THEN** 全部报 `USAGE`，退出码 2，没有创建任何文件夹
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-04] 智能体创建的项目同样默认已保留
- 前提：环境变量 `RUNYARD_AGENT` 为 `Claude Code`
- **WHEN** 不带 `--clean-after` 创建项目
- **THEN** 项目是已保留，永远不会进入提醒或清理
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-05] 事后切换
- 前提：一个已保留的项目
- **WHEN** 把它改为自动清理 14 天，再改回已保留
- **THEN** 两次切换都生效并发出 `playground.changed`；改回已保留后，之前为它记下的提醒状态被清除
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-06] 已保留的项目永不被清理
- 前提：一个已保留的项目，上次使用是 400 天前
- **WHEN** 判断哪些项目要提醒、要清理
- **THEN** 两份清单里都没有它
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-07] 给很久没用的老项目打开自动清理
- 前提：一个已保留的项目，上次使用是 100 天前
- **WHEN** 把它改为自动清理 30 天
- **THEN** 计时从打开自动清理的那一刻起算，而不是从 100 天前；当天它不在提醒清单里
- 验证：test

### Requirement: 什么算一次使用
计时 MUST 在这些时刻重新开始：项目创建时；在应用里打开标签页并启动运行时；通过命令行运行一次时（`run`、`new --run`）。下列情形 MUST NOT 算使用：只是出现在列表里；`status`、`logs` 等只读命令；“打开但不运行”；重新打开应用时恢复出来但没有启动的标签页（切过去启动时才算）。一次使用 MUST 同时清除已为该项目记下的提醒状态。
来源：PRD #prd-auto-clean；PRD #prd-restore-tabs；PRD #prd-decision-table（第 12 项）

#### Scenario: [LIBRARY-AUTO-CLEAN-08] 创建时开始计时
- **WHEN** 创建一个自动清理 7 天的项目
- **THEN** 它的上次使用时间就是创建时间，到期时间是创建时间加 7 天
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-09] 命令行运行算一次使用
- 前提：自动清理 7 天的项目，上次使用是 6 天前
- **WHEN** 执行 `runyard run <名称>`
- **THEN** 上次使用时间更新为现在，到期时间重新算起
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-10] 在应用里打开并启动算一次使用
- 前提：同上
- **WHEN** 用户在桌面应用里打开这个项目的标签页，运行启动
- **THEN** 上次使用时间更新为现在
- 验证：manual（标签页属于桌面应用，M2 才有；管理进程一侧由持有者为 `tab` 的 `run.start` 覆盖）

#### Scenario: [LIBRARY-AUTO-CLEAN-11] 只读命令不算使用
- 前提：自动清理 7 天的项目，上次使用是 6 天前
- **WHEN** 执行 `runyard status <名称>`、`runyard logs <名称>`，并在资源库里列出它
- **THEN** 上次使用时间不变
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-12] 打开但不运行不算使用
- 前提：同上
- **WHEN** 用“打开但不运行”查看这个项目
- **THEN** 上次使用时间不变
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-13] 恢复出来但没启动的标签页不算
- 前提：上次关闭应用时这个项目的标签页开着，现在重新打开应用，它不是当前显示的那一个
- **WHEN** 应用恢复标签页
- **THEN** 这个项目的运行没有启动，上次使用时间不变；用户切到它、运行启动的那一刻才更新
- 验证：manual（标签页恢复属于桌面应用，M2 才有）

#### Scenario: [LIBRARY-AUTO-CLEAN-14] 使用会清除已显示的提醒
- 前提：项目的提醒已显示
- **WHEN** 命令行运行了它一次
- **THEN** 它不再是“明天清理”，提醒状态被清除；到期时间重新算起
- 验证：test

### Requirement: 到期前一天只在应用内提醒一次
离到期时间不足 24 小时的项目 MUST 进入“待提醒”清单。系统 MUST 只在界面确认提醒真的显示了（窗口可见、资源库页已显示）之后才记下“提醒已显示”及时间；已记下的提醒 MUST NOT 在之后的检查里重复进入待提醒清单。系统 MUST NOT 发系统通知。用户 MUST 能在提醒里一键“改为保留”，改后该项目 MUST 立即变为已保留并清除全部提醒状态。
来源：PRD #prd-auto-clean；PRD #prd-decision-table（第 9 项）

#### Scenario: [LIBRARY-AUTO-CLEAN-15] 到期前一天进入待提醒
- 前提：自动清理 30 天的项目，上次使用是 29 天零 1 小时前
- **WHEN** 判断哪些项目要提醒
- **THEN** 它在待提醒清单里；上次使用是 28 天前的项目不在
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-16] 没确认显示就不记
- 前提：项目在待提醒清单里，但应用窗口不可见
- **WHEN** 下一轮检查
- **THEN** 项目仍在待提醒清单里，没有“提醒已显示”的记录，因此不会被清理
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-17] 确认显示后记下时间
- 前提：项目在待提醒清单里
- **WHEN** 界面确认提醒已显示，回报 `clean.ackReminder`
- **THEN** 项目记下提醒显示的时间，之后不再进入待提醒清单
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-18] 一键改为保留
- 前提：项目的提醒已显示
- **WHEN** 用户点“改为保留”，回报 `clean.keep`
- **THEN** 项目变为已保留，提醒状态清除，两份清单里都没有它
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-19] 不发系统通知，也不通过命令行提醒
- **WHEN** 项目进入待提醒清单
- **THEN** 没有任何系统通知被发出；命令行的任何命令输出里也没有清理提醒
- 验证：manual（系统通知和 Dock 角标属于桌面应用，M2 才有）

### Requirement: 到期且提醒已显示满一天才清理
一个自动清理的项目 MUST 同时满足这两条才进入“可清理”清单：已过到期时间（上次使用时间加所选天数）；“提醒已显示”的记录距今满 24 小时。没有提醒记录的过期项目 MUST 先进入待提醒清单，MUST NOT 直接清理。清理 MUST 只在桌面应用运行时判断；命令行单独使用时 MUST NOT 清理任何项目。
来源：PRD #prd-auto-clean；PRD #prd-decision-table（第 9 项）

#### Scenario: [LIBRARY-AUTO-CLEAN-20] 提醒显示不足一天
- 前提：项目已过到期时间，提醒 23 小时前显示
- **WHEN** 判断哪些项目可以清理
- **THEN** 它不在可清理清单里
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-21] 提醒显示满一天
- 前提：项目已过到期时间，提醒 24 小时前显示
- **WHEN** 判断哪些项目可以清理
- **THEN** 它在可清理清单里
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-22] 应用很久没打开
- 前提：自动清理 7 天的项目，上次使用是 60 天前，期间应用一直没运行，没有提醒记录
- **WHEN** 应用启动后做第一次检查
- **THEN** 它进入待提醒清单而不是可清理清单；界面确认显示 24 小时后才可清理
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-23] 提醒之后又用了
- 前提：项目的提醒已显示满 24 小时，已过到期时间
- **WHEN** 清理之前，命令行运行了它一次
- **THEN** 它不在可清理清单里，到期时间重新算起
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-24] 命令行单独使用不会清理
- 前提：桌面应用没有运行，一个自动清理的项目已过到期时间且提醒记录已满一天
- **WHEN** 只执行命令行命令（`status`、`run`、`new` 等）
- **THEN** 没有任何项目被移到废纸篓
- 验证：test

### Requirement: 正在使用的顺延，找不到的和根目录不在的跳过
正在运行或有标签页开着的项目 MUST NOT 被清理，清理 MUST 顺延一天后再判断；顺延只作用于清理，不改变提醒。`missingSince` 不为空（找不到文件夹）的项目 MUST NOT 被提醒也 MUST NOT 被清理。资源库根目录不在（如外置盘没挂上、网盘还没同步完）时，这一轮检查 MUST 整体跳过，MUST 记一行日志，MUST NOT 把项目标成找不到，也 MUST NOT 清理任何项目。
来源：PRD #prd-auto-clean；PRD #prd-decision-table（第 19 项）

#### Scenario: [LIBRARY-AUTO-CLEAN-25] 正在运行的项目顺延
- 前提：项目已满足全部清理条件，但有一次运行处于 `ready`
- **WHEN** 判断哪些项目可以清理
- **THEN** 它不在可清理清单里，下一次判断被推迟到一天之后
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-26] 有标签页开着的项目顺延
- 前提：项目已满足全部清理条件，没有运行，但有一个标签页开着
- **WHEN** 判断哪些项目可以清理
- **THEN** 它不在可清理清单里，推迟一天
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-27] 停下之后才清理
- 前提：上一个场景之后一天，标签页已关、没有运行
- **WHEN** 判断哪些项目可以清理
- **THEN** 它在可清理清单里；一天后仍在使用则再顺延一天
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-28] 找不到文件夹的项目
- 前提：项目的 `missingSince` 有值，其余条件都满足
- **WHEN** 判断哪些项目要提醒、要清理
- **THEN** 两份清单里都没有它
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-29] 资源库根目录不在
- 前提：资源库根目录所在的外置盘没有挂上，里面有若干满足条件的项目
- **WHEN** 做一轮检查
- **THEN** 这一轮没有提醒也没有清理，没有项目被标成 `missingSince`，日志里有一行说明跳过的原因
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-30] 根目录回来之后恢复检查
- 前提：上一个场景之后外置盘重新挂上
- **WHEN** 下一轮检查
- **THEN** 项目按正常规则判断，不因为上一轮被跳过而被清理或丢失状态
- 验证：test

### Requirement: 清理只移到废纸篓
清理一个项目 MUST 与 `rm` 走同一条路径：先停止运行，让所有已连接的客户端释放句柄，再只通过平台层的“移到废纸篓”完成。MUST NOT 以任何方式永久删除。平台层失败时 MUST 返回 `TRASH_UNAVAILABLE`（或文件夹被占用时 `PATH_LOCKED`），项目 MUST 原样留在资源库里，MUST 记一行日志，MUST NOT 退到别的删除方式，下一轮检查再试。
来源：PRD #prd-auto-clean；PRD #prd-retention；ADR 0010

#### Scenario: [LIBRARY-AUTO-CLEAN-31] 清理一个项目
- 前提：项目在可清理清单里，没有运行
- **WHEN** 对它执行清理
- **THEN** 项目文件夹出现在废纸篓里，资源库里不再有它，发出 `playground.removed`；之后可以从废纸篓恢复
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-32] 放不进废纸篓
- 前提：测试用的假平台让 `fs.trash` 失败
- **WHEN** 对一个可清理的项目执行清理
- **THEN** 错误码 `TRASH_UNAVAILABLE`；项目文件夹完整保留，没有任何内容被永久删除；日志一行；下一轮检查它仍在可清理清单里
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-33] 文件夹被占用
- 前提：测试用的假平台让改名以 `EBUSY` 失败
- **WHEN** 对一个可清理的项目执行清理
- **THEN** 错误码 `PATH_LOCKED`；文件夹仍在原处
- 验证：test

#### Scenario: [LIBRARY-AUTO-CLEAN-34] 判断逻辑不依赖真实时间
- 前提：给定一个假时钟和一份资源库状态
- **WHEN** 多次调用同样输入的判断
- **THEN** 结果完全相同；判断本身不读写磁盘、不启动进程，不做任何移动
- 验证：test

### Requirement: 检查的时机在桌面应用
自动清理的检查 MUST 在桌面应用启动后 30 秒、之后每小时、从睡眠唤醒时各进行一次，且只在应用运行时进行。索引丢失重建后，上次使用时间 MUST 取重建时的当前时间，因此重建后 MUST NOT 立即清理任何项目。
来源：PRD #prd-auto-clean；PRD #prd-decision-table（第 9 项）；技术设计 §4.7

#### Scenario: [LIBRARY-AUTO-CLEAN-35] 三个检查时机
- **WHEN** 桌面应用启动、过去一小时、系统从睡眠唤醒
- **THEN** 应用启动 30 秒后检查一次；之后每小时一次；唤醒时立即一次
- 验证：manual（调度在桌面应用主进程里，M2 才有）

#### Scenario: [LIBRARY-AUTO-CLEAN-36] 索引重建后不立即清理
- 前提：`library.json` 被删除，资源库里有自动清理的项目，它们原来早已过期
- **WHEN** 管理进程启动并重建索引，随后做一轮检查
- **THEN** 重建的项目上次使用时间是当前时间，两份清单都是空的
- 验证：test
