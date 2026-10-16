# logs Specification

## Purpose

约定一次运行的输出怎样被记录、保存和读取。运行的输出走管道，日志里存的是未清洗的整行（颜色码等控制序列原样保留），读取时才清洗成纯文本；智能体用游标只读“上次之后的新内容”。管理进程插进日志的提示是带代码的结构化条目，不是句子。stdout 与 stderr 在紧凑写入时的先后不作承诺。

## Requirements

### Requirement: 写入时只切行和解码
日志 MUST 存未清洗的整行：只按换行（0x0A）把每一路输出切成整行，半行 MUST 等下一块数据或进程结束；解码 MUST 先用严格 UTF-8，失败再用 GB18030。颜色码、回车、字节序标记 MUST 原样保留。
来源：ADR 0008；PRD #prd-failure-states

#### Scenario: [RUN-LOGS-01] 半行跨数据块
- 前提：输出分两块到达，第一块以半行结尾
- **WHEN** 第二块带着行尾到达
- **THEN** 日志里只有一条完整的行，第一块没有被单独记成一行
- 验证：test

#### Scenario: [RUN-LOGS-02] 进程结束时的残行
- 前提：进程最后输出的内容没有换行
- **WHEN** 进程退出
- **THEN** 这段残行作为最后一条记录写入
- 验证：test

#### Scenario: [RUN-LOGS-03] GB18030 回退
- 前提：输出的字节不是合法的 UTF-8，但是合法的 GB18030
- **WHEN** 解码这一行
- **THEN** 得到正确的中文文字，没有乱码字符
- 验证：test

#### Scenario: [RUN-LOGS-04] 控制序列原样存储
- 前提：Vite 的报错框带颜色码
- **WHEN** 查看磁盘上的日志记录和 `--raw` 读取的结果
- **THEN** 颜色码原样保留
- 验证：test

### Requirement: 读取时按九条规则清洗
`logs.read` 与命令行 `logs` 在不带 `raw` 时 MUST 返回清洗后的纯文本：去行尾回车；去开头的字节序标记（其余规则处理完后，重新露出来的开头标记也去掉，保证清洗两遍结果不变）；把 `ESC[1G` 当作回车；剥掉各类转义序列（颜色、光标、清屏、超链接）；行内多个回车只留最后一段；退格删去前一个字符；删去剩余控制字符（保留制表符）；整行都是控制序列的行丢弃。带 `raw: true` 时 MUST 原样返回。
来源：ADR 0008；PRD #prd-cli-json

#### Scenario: [RUN-LOGS-05] 颜色码被清掉
- 前提：一行是带颜色码的红色文字 `error`
- **WHEN** 不带 `raw` 读取
- **THEN** 得到纯文本 `error`，没有转义序列
- 验证：test

#### Scenario: [RUN-LOGS-06] 进度条只留最后一段
- 前提：一行里用回车反复重绘进度，最后一段是 `100%`
- **WHEN** 不带 `raw` 读取
- **THEN** 得到 `100%`
- 验证：test

#### Scenario: [RUN-LOGS-07] 纯控制序列的行被丢弃
- 前提：一行只有清屏序列
- **WHEN** 不带 `raw` 读取
- **THEN** 这一行不出现在结果里
- 验证：test

#### Scenario: [RUN-LOGS-08] 退格和字节序标记
- 前提：一行以字节序标记开头，且含 `ab\bc`
- **WHEN** 不带 `raw` 读取
- **THEN** 得到 `ac`，没有字节序标记；制表符保留
- 验证：test

#### Scenario: [RUN-LOGS-09] 清洗是幂等的
- **WHEN** 对已清洗的结果再清洗一次
- **THEN** 结果不变
- 验证：test

### Requirement: 所有系统的子进程都按 UTF-8 且不缓冲输出
管理进程 MUST 在所有系统上给 Python 子进程设置使用 UTF-8 且不缓冲输出的环境变量，MUST 关闭 Next 等工具的遥测，MUST NOT 设置 `CI=1`。
来源：ADR 0008；PRD #prd-failure-states

#### Scenario: [RUN-LOGS-11] 强杀时已打印的行不丢
- 前提：Python 脚本每秒打印一行，共打印 5 行后仍在运行
- **WHEN** 强制停止它
- **THEN** 已打印的 5 行都在日志里
- 验证：test

#### Scenario: [RUN-LOGS-12] 不设 CI
- **WHEN** 检查任何运行的子进程环境
- **THEN** 没有 `CI=1`
- 验证：test

### Requirement: 容量限制
内存里每次运行 MUST 只留最近 1 万行或 4 MB（先到为准）；磁盘上每次运行一个文件，MUST NOT 超过 10 MB（超过后只留最后 10 MB）；每个项目 MUST 只保留最近 5 次运行的日志。
来源：ADR 0008；实现细节

#### Scenario: [RUN-LOGS-13] 超过 1 万行
- **WHEN** 一次运行输出 1 万零 500 行
- **THEN** 内存里只保留最近 1 万行
- 验证：test

#### Scenario: [RUN-LOGS-14] 磁盘文件超过 10 MB
- **WHEN** 一次运行的日志超过 10 MB
- **THEN** 磁盘上只留最后 10 MB，文件大小不超过 10 MB
- 验证：test

#### Scenario: [RUN-LOGS-15] 第 6 次运行
- 前提：一个项目已有 5 次运行的日志
- **WHEN** 开始第 6 次运行
- **THEN** 最旧一次的日志被删除，只剩最近 5 次
- 验证：test

### Requirement: 游标只读新内容
读取日志 MUST 支持游标，游标形如 `<runId>:<序号>`，对调用方不透明；带游标读取 MUST 只返回其后的内容；游标属于更早一次运行时 MUST 返回当前运行的全部内容并标 `truncated: true`。
来源：PRD #prd-cli-json

#### Scenario: [RUN-LOGS-16] 只读上次之后的内容
- 前提：上次读取返回游标 `r_1:12`，之后又输出了一行
- **WHEN** 带 `since=r_1:12` 读取
- **THEN** 只返回新的那一行，并返回新的游标
- 验证：test

#### Scenario: [RUN-LOGS-17] 游标来自更早的运行
- 前提：游标属于上一次运行
- **WHEN** 带这个游标读取当前运行
- **THEN** 返回当前运行的全部内容，`truncated` 为 `true`
- 验证：test

#### Scenario: [RUN-LOGS-18] 默认只取最后 200 行
- 前提：一次运行输出了 500 行
- **WHEN** 命令行 `logs` 不带 `--tail`
- **THEN** 返回最后 200 行
- 验证：test

### Requirement: 管理进程插入的提示是结构化条目
管理进程自己插进日志的提示（命令、端口改用、空闲停止、没有 pnpm 改用 npm 等）MUST 是带代码和参数的 `system` 条目，MUST NOT 是已经拼好的句子。
来源：PRD #prd-cli-language；ADR 0008

#### Scenario: [RUN-LOGS-19] 端口改用的提示
- 前提：运行因原端口被占用而改用别的端口
- **WHEN** 读取日志
- **THEN** 其中有一条 `kind: 'system'` 的条目，带提示码 `PORT_FALLBACK` 和参数（原端口、实际端口），没有显示用的文字
- 验证：test

#### Scenario: [RUN-LOGS-20] 日志在运行结束后仍可读
- 前提：一次运行已 `stopped`
- **WHEN** 用 `logs` 读取该项目
- **THEN** 仍能读到那次运行的日志，直到被第 6 次运行挤掉或被 `logs.clear` 清除
- 验证：test

#### Scenario: [RUN-LOGS-21] 子进程环境带 UTF-8 与不缓冲的开关
- **WHEN** 检查任何运行的子进程环境
- **THEN** 有 `PYTHONUTF8=1`、`PYTHONUNBUFFERED=1` 和 `NEXT_TELEMETRY_DISABLED=1`，与项目是否用到 Python 无关
- 验证：test
