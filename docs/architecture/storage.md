# 存储：磁盘上的文件、谁写、怎么升级

管理进程和命令行读写的每一个文件。各系统同一种布局（第一版只有 macOS；Windows 以后，`~` 将是 `%USERPROFILE%`）。形状的唯一出处是 `@runyard/protocol` 里每种文件的 zod 定义（`file-*.ts`、`log-line.ts`）；本篇说明字段的含义和规则。

出处：技术设计 §4.2、§4.5、§5.4、§2.4；决策记录 [0005](decisions/0005-supervisor-singleton-handshake.md)、[0008](decisions/0008-log-capture-and-cleaning.md)、[0009](decisions/0009-toolchain-resolution-macos.md)、[0010](decisions/0010-trash-and-delete.md)；PRD #prd-agent-created、#prd-retention。字段级细节另参考了技术设计形成过程中的专家方案，已按设计修订；冲突处以设计为准。

## 1. 布局与谁写

核心规则：**所有共享文件只由管理进程写**（§2.3）；命令行只读它们，经协议请求修改。例外只有两个：命令行自己的 `cli.json`；桌面应用 main 写自己的 `app.log` 和用户数据目录。

```
~/Runyard/<name>/.runyard/playground.json   项目元数据，随文件夹走           写：管理进程
~/.runyard/settings.json                    应用和命令行共用的设置            写：管理进程
~/.runyard/cli.json                         命令行自己的设置（语言）          写：命令行（config set lang）
~/.runyard/templates/<id>/                  用户模板                          写：管理进程
~/.runyard/state/library.json               索引和本机状态                    写：管理进程
~/.runyard/state/toolchain.json             工具检测结果缓存                  写：管理进程
~/.runyard/run/supervisor.json              发现文件                          写：管理进程
~/.runyard/run/supervisor.lock              内核锁文件（macOS、Linux）        管理进程持有
~/.runyard/run/supervisor.sock              socket 文件（macOS、Linux）       管理进程
~/.runyard/run/runs/<runId>.json            每次运行一个，只为崩溃后清理      写：管理进程
~/.runyard/logs/                            管理进程日志、每次运行的日志      写：管理进程
~/.runyard/logs/app.log                     桌面应用日志                      写：桌面应用 main
<Electron 用户数据目录>/                    窗口、标签页、不再提示、预览 cookie  写：桌面应用
```

以上是设计已定的布局。路径里的 `<name>`、`<id>`、`<runId>` 是占位符。**计划**：这些文件在对应包实现之前都不存在。

## 2. 各文件的字段

### 2.1 `playground.json`（项目文件夹里）

| 字段 | 内容 |
| --- | --- |
| `formatVersion` | 整数，现为 1 |
| `id` | 创建时生成（ULID）、之后不变；文件夹改名或移动后靠它认回 |
| `template` | 来自哪个模板（`{ id, source: 'builtin' \| 'user', appVersion }`） |
| `runner` | 运行器 id |
| `requires` | 创建时从模板复制的工具与版本范围，以后抬高模板下限不影响旧项目 |
| `requiresInstall` | 可无。创建时从模板 `requires.<工具>.install` 原样复制的安装方式（`{ <工具>: { command?: string[], url?: string } }`），只在缺工具提示里展示、从不执行。单独成字段是为了 `requires` 的值仍是版本范围字符串；它是可选新增字段，旧程序原样保留（顶层未知字段），不升 `formatVersion`、不加升级链条目 |
| `toolchainAtCreate` | 创建时各工具的实际版本 |
| `packageManager` | `pnpm` 或 `npm`，创建时选定后固定 |
| `entry`、`open` | 入口文件、创建时打开的文件（`/` 分隔的相对路径） |
| `note` | 备注 |
| `createdAt`、`createdBy` | 创建时间；`{ kind: 'user' \| 'agent' \| 'cli', agent?, command? }` |
| `autoClean` | 开关和天数；计时不在这里，在 `library.json` |
| `script.autoRun` | 脚本项目“保存后自动运行”（可无） |
| `requestAutoResend` | 请求面板“服务重载后自动重发”的开合（可无，没写过就是开） |
| `lastRequest` | 请求面板上一次发出的请求：`method`、`path`、`headers`（`{name,value}` 数组）、`payload`（可无） |
| `trust` | 第一版恒为 `trusted` |

名称不存，永远取文件夹名。放在文件夹里是为了文件夹被拷走、改名后仍认得自己，索引丢了能重建。

### 2.2 `state/library.json`（本机索引）

`{ formatVersion, root, playgrounds: Entry[] }`；`Entry` 的字段：

| 字段 | 内容 |
| --- | --- |
| `id`、`path` | 项目 id、绝对路径 |
| `port` | 记住的端口，**这就是端口登记表**，不另开文件；脚本没有端口 |
| `lastUsedAt` | 创建时取创建时间；打开标签页并运行或命令行运行时更新，开启自动清理时也重置为当时；“打开但不运行”不更新。自动清理的计时用它 |
| `lastOpenedAt` | 应用里打开项目标签页时更新（`playground.markOpened`），“打开但不运行”也更新；恢复标签页和切换标签页不更新 |
| `clean` | 提醒何时显示过、顺延到何时 |
| `missingSince` | 找不到文件夹的起始时间 |

资源库的“最近使用”一列不另存字段：取 `lastOpenedAt` 和 `lastUsedAt` 中较晚的一个（没有 `lastOpenedAt` 就用 `lastUsedAt`），见 PRD #prd-library-list。

放在本机是因为端口和使用时间只对本机有意义，而且变得勤（放进文件夹会让 git 一直有改动）。索引丢失时从磁盘重扫重建：端口重新分配，`lastUsedAt` 取当前时间（清理只会变晚，不会变早）。

文件夹被动过时的判断（§4.2，PRD #prd-decision-table 第 19 项）：被改名的按 `id` 认回，端口和设置不变；找不到的标 `missingSince`，行显示“找不到文件夹”，操作是“重新定位”“从资源库移除”；复制出来的同 `id` 文件夹换新 `id` 和新端口；没有 `.runyard/` 的文件夹忽略。

### 2.3 `settings.json` 与 `cli.json`

| 字段 | 默认 |
| --- | --- |
| `libraryRoot` | `~/Runyard` |
| `externalEditor` | 自动探测 |
| `packageManager` | `auto`（另有 `pnpm`、`npm`） |
| `autoSave` | 停止输入 1 秒后保存（另两档：失去焦点时、关闭） |
| `scriptAutoRun` | `true` |
| `cliIdleStopMinutes` | 30 |
| `network` | 镜像源、代理、本机不走代理 |
| `toolPaths` | 工具名到绝对路径，用户“指定路径…”的结果 |
| `ports` | 范围 7100 到 7999 |
| `urlNewSkipConfirmForBuiltin` | `false` |
| `updateCheck` | `true` |
| `confirmCloseRunningTab` | `true`（关闭运行中的标签页前确认；“不再提示”写 `false`；文件里没有这个字段按 `true` 读，不升 `formatVersion`） |
| `theme`、`language` | `language` 只管桌面应用界面语言 |

`cli.json`：`formatVersion`、`lang`（`en` 或 `zh-CN`；没有这个字段就是英文）。只由 `runyard config set lang <locale>` 写入，`--lang` 和环境变量 `RUNYARD_LANG` 不写它。放单独文件是因为 `--help` 和 `config` 在管理进程没起来时也要能用。

`libraryRoot` 的位置提醒（0009）：macOS 上选在“桌面”“文档”“下载”之内时给警告；Windows 以后：同类警告是网盘同步目录。判断在平台层 `paths`。

### 2.4 发现文件与锁（`run/`）

| 文件 | 内容 | 说明 |
| --- | --- | --- |
| `supervisor.json` | `pid`、`processStart`（管理进程的启动时间，操作系统给出；v2 起，v1 文件没有，缺失时客户端只比 pid）、`startedAt`、`endpoint`（连接点）、`token`（握手口令，32 字节随机数）、`protocol`、`minClientProtocol`、产品版本、构建标识、`host`（`electron` 或 `node`）、`execPath` | 只有本人可读（权限 600）；先写临时文件再改名；`doctor --bundle` 打包前去掉 `token` |
| `supervisor.lock` | 空文件 | macOS 用 `O_EXLOCK` 持有，进程一死由内核释放；Linux 用抽象 socket，没有文件 |
| `supervisor.sock` | socket 文件 | 持锁者才许删除残留并监听 |
| `runs/<runId>.json` | `runId`、`playgroundId`、`owner`、`pid`、`processStart`（操作系统给出的进程启动时间）、`cwd`、`port`、`command`、`startedAt`、`state`，运行标记另需（0006，Windows 以后必须） | 只为崩溃恢复：下次启动逐个核对 pid 加启动时间，仍活着的整棵结束，标 `crashed`；运行期间的真相在内存里 |

### 2.5 日志（0008、§4.5）

| 项 | 约定 |
| --- | --- |
| 格式 | 每个运行一个文件，一行一个 JSON，形状是 `LogEntry`（见 protocol.md）。`stdout`、`stderr` 的 `text` 是**未清洗**的整行：写入时只切行（按 0x0A）并解码（先严格 UTF-8，失败则 GB18030），颜色码、`\r`、BOM 原样保留 |
| 读取时清洗 | 九条规则，全文在 [证据 0008](evidence/0008-log-capture-and-cleaning.md) 6.2；`--raw` 跳过 |
| 容量 | 内存里每次运行最近 1 万行或 4 MB；磁盘单个文件上限 10 MB，每个项目留最近 5 次运行 |
| 顺序 | 两路输出按到达顺序合并，每行带序号；不承诺 stdout 与 stderr 的严格先后 |
| 文件位置 | `~/.runyard/logs/<runId>.<playgroundId>.jsonl`，与 `supervisor.log`、`app.log` 同在 `logs/` 下，不分子目录；运行编号按时间递增，文件名从小到大就是从旧到新（`doctor --bundle` 靠这一点取最近三次） |
| 磁盘上限 | 单个文件超过 10 MB 时从头部掐掉旧行，一次砍到 9 MB 以内的整行（留出余量，免得之后每写一行都重写一遍文件）；掐掉的行序号不重排。每个项目留最近 5 次（第 6 次运行开始时删最旧的）；`logs.clear` 清空正在写的这一次、删掉更早的 |
| 程序日志 | `supervisor.log`（管理进程）、`app.log`（桌面应用 main，renderer 的日志经 main 转写），同一套轮转规则：单个文件超过 5 MB 就轮转，保留 `.1` 到 `.3` 三份旧文件。启动者以追加方式打开 `supervisor.log`，所以不改名，而是复制到 `.1`（旧的顺延）再清空原文件；只在管理进程启动时做 |

## 3. 版本与升级（§4.2、决策记录 0005 以后的格式规则）

- 每个文件有整数 `formatVersion`；每种文件一条升级链（`vN` 到 `vN+1`），读入时在内存里升到最新，下次写入时落盘。升级链放在 `protocol`（`file-format.ts`），现在只有 `supervisor.json` 是 v2（v1 到 v2 加了 `processStart`，升级不改内容），其余都是 v1、链是空的。
- 读到比程序认识的**更新**的版本：只读不写，提示需要更新版本的 Runyard。这样旧命令行不会把新应用写的文件改坏。`readVersioned` 对这种文件返回 `status: "newer"`（带 `readOnly: true`、文件版本、程序认识的版本，不解析内容）；`canWrite` 只对读入成功的返回真。对这种文件：**读仍然允许**（只读视图，能看到内容）；**任何会写它的操作一律拒绝**，返回错误码 `DATA_FROM_NEWER_VERSION { file, found, supported }`（退出码 10，与 `CLIENT_OUTDATED` 同类：要用户升级 Runyard 才能继续）。不改写、不降级、不为了写入而先“修一下”。`file` 是 `dataFileKinds` 里的文件名（`playground.json`、`library.json`、`settings.json`、`cli.json`），`found` 是文件里的版本，`supported` 是本程序认识的最高版本。会声明这个错误码的方法见 `docs/reference/protocol.md`（`playground.create|rename|update|duplicate|trash|relocate|forget`、`library.rescan`、`run.start|restart`（写 `library.json` 里记住的端口和 `lastUsedAt`）、`settings.set`、`toolchain.setPath`）；读方法不声明。两个例外：`toolchain.json` 是缓存，读到更新版本时不写缓存、照常检测，不报这个错；`supervisor.json` 和运行记录由管理进程每次整个重写，不经方法。`cli.json` 由命令行自己写，`config set lang` 遇到更新版本的 `cli.json` 同样以这个错误码失败。
- 写入一律先写临时文件再改名；改名覆盖遇到占用时的重试（Windows 以后）。
- 解析失败（不是 JSON、不是对象、版本号不对、升级抛错、形状不合法）：把坏文件改名留存（`quarantineFileName`：`<文件名>.corrupt-<毫秒时间>`），再按文件种类处理，`readVersioned` 的返回里带 `recovery`：`library.json` 重扫（`rescan`）；`settings.json`、`cli.json` 回到默认并提示一次（`defaults`）；`toolchain.json`、`supervisor.json` 丢弃（`discard`，缓存重建；发现文件坏了按“没有发现文件”）；`playground.json`、运行记录跳过这一个、不重写（`skip`，身份只存在那个文件里；崩溃清理无法核对身份的进程不结束）。
- 未知字段：`playground.json`、`library.json`（顶层和每一项）、`settings.json`、`cli.json` 原样保留，写回时不丢，因为旧程序可能读到新程序多写的字段；`supervisor.json`、运行记录、`toolchain.json` 每次整个重写，读入时丢弃未知字段。
- 路径字段（`entry`、`open`）用 `/` 分隔的相对路径，不许反斜杠、绝对路径、盘符、`.` 和 `..` 段（`relativePathSchema`）。
- 日志文件每行一个 JSON：`LogEntry` 加 `seq`（一次运行内按到达顺序递增，游标 `<runId>:<seq>` 指它；掐掉旧行后序号不重排）。日志是追加写的流，没有 `formatVersion`；崩溃留下的半行读到时跳过（`parseLogLine` 返回 `ok: false`）。
- 改动磁盘格式属于破坏性改动，要写决策记录（AGENTS.md 完成标准）。

## 未定

1. ~~轮转规则的数字~~ 已定（#43）：单个文件 5 MB，保留 `.1` 到 `.3`，启动时复制再清空（见 2.5）。`app.log` 由桌面应用沿用同一规则，实现不在 #43。
2. ~~每次运行日志文件的目录和文件命名~~ 已定（#43）：`logs/<runId>.<playgroundId>.jsonl`（见 2.5）。
3. ~~测试里怎样把 `~/.runyard` 和 `~/Runyard` 换成临时目录~~ 已定：显式传参，不读环境变量。平台层的 `home` 选项决定两个目录，`@runyard/testing` 的 `createTempHome()` 造临时主目录（决策记录 0014）。
4. ~~`toolchain.json` 的逐字段形状~~ 已定（#19）：`{ formatVersion, entries: { <键>: { checkedAt, tools: ToolCheck[] } } }`。键由 core 按 0009 拼成不透明字符串（登录 shell 加启动文件 mtime 指纹，有项目版本文件时加项目路径）；有效期 `TOOLCHAIN_CACHE_TTL_MS` 为 1 小时（`isToolchainCacheFresh`，时间由调用方给）；条目与 `toolchain.check` 的出参同形，不留检测用的 PATH。
5. 升级时是否保留 `.bak-vN` 备份：`protocol` 只做内存里的纯升级，返回里带 `upgradedFrom`，不碰磁盘；要不要在第一次落盘前备份由 core 和 supervisor 的实现 issue 决定，设计仍未确认，需要负责人拍板。
6. 发现文件被删而管理进程仍活着的恢复办法（0005 已列为空白）。
