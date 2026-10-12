# @runyard/core

## 用途

工具检测、运行引擎、资源库、模板、自动清理的判断（技术设计 §3.2）。运行引擎不知道“标签页”和“命令行”是什么，持有者只是 `supervisor` 里的概念。
现状：只有日志的切行、解码和读取时清洗（`src/logs/`）。其他模块由后续 issue 各自加入。

## 对外暴露什么

只从 `src/index.ts` 导出（`exports` 只有 `.`），其他包只从 `@runyard/core` 导入。
- `createLineSplitter({ stream, now })`：每一路输出（stdout、stderr）一个。`push(字节块)` 返回凑齐的整行 `LogEntry`，半行留到下一块；`end()` 在进程结束时交出没有换行的残行。只按 0x0A 切，行里的 CR、颜色码、字节序标记原样保留。
- `decodeLogLine(字节)`：先严格 UTF-8，失败再 GB18030；不吞字节序标记。
- `cleanLogText(文本)`：读取时的九条清洗规则，纯控制序列的行返回 `null`（丢弃）；幂等。
- `cleanLogEntries(条目们)`：对 stdout、stderr 条目清洗并丢掉空结果，命令和系统条目原样保留。

## 本包特有的规则

- 可以导入：`@runyard/protocol`、`@runyard/platform`（依赖规则的唯一出处是 `tooling/checks/layers.json`）。不许导入 `i18n`，不产生给人看的句子。
- 日志里存未清洗的整行，清洗只在读取时做（决策记录 0008）；规则的全文在 `docs/architecture/evidence/0008-log-capture-and-cleaning.md` 6.2。改规则要先改规格。
- 类型环境只有 Node 类型，没有 DOM。
- 内存环形缓冲、日志文件、游标和 `logs` 方法属于 `supervisor`，不在本包。

## 子目录地图

- `src/logs/`：日志的切行、解码和清洗；每个文件旁有同名 `.test.ts`

## 测试

在仓库根目录运行（需要 Node 24）：

```sh
pnpm test --filter @runyard/core
```

日志相关测试不依赖平台实现，Windows 任务也要通过。
