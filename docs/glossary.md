# 术语表

每个中文产品术语对应到代码里**唯一**的英文标识符。写文档用“中文术语”一列的说法，写代码用“代码标识符”一列的词，不自己造同义词。

这是骨架：只收了 PRD 和技术设计里已经写明的条目。“—”表示产品文档还没有规定，不是“随便写”；协议定稿时（M1）补全状态名等更多条目，补的时候同时写明出处。

`pnpm check` 的 `terms` 检查读“禁用”两列：中文禁用词在说明文件和源码里查，英文禁用词在产品代码的标识符里查。表头的名字不要改，检查按名字找列。

| 中文术语 | 代码标识符 | 界面英文 | 禁用（中文） | 禁用（英文） | 出处 |
| --- | --- | --- | --- | --- | --- |
| 项目 | `playground` | playground | — | — | PRD #prd-glossary；技术设计 §4.1 |
| 资源库 | `library` | — | — | — | PRD #prd-glossary；技术设计 §4.2 |
| 模板 | `template` | — | — | — | PRD #prd-glossary；技术设计 §4.1 |
| 运行器 | `runner` | — | — | — | PRD #prd-glossary；技术设计 §4.1 |
| 运行 | `run` | — | — | — | 技术设计 §4.1 |
| 持有者 | `owner`（取值 `tab`、`cli`） | — | — | — | PRD #prd-run-ownership；技术设计 §4.1 |
| 管理进程 | `supervisor` | — | — | — | PRD #prd-glossary；技术设计 §2.1 |
| 自动清理 | `autoClean`（开，带天数；关） | — | 临时项目、到期清理 | scratch | PRD #prd-retention；PRD #prd-auto-clean；PRD #prd-revisions |
| 备注 | `note` | — | — | — | PRD #prd-note；技术设计 §4.2 |
| 最近使用 | `lastOpenedAt` 与 `lastUsedAt` 取较晚 | — | — | — | PRD #prd-library-list；docs/architecture/storage.md |
| 通知 | `notification`（分 `actionable` 需要处理、`info` 其余） | notification | — | — | PRD #prd-notifications |
| 工具链 | `toolchain` | — | — | — | PRD #prd-glossary；技术设计 §3.1 |
| 平台层 | `platform` | — | — | — | 技术设计 §3.2、§7.1 |
| 标签页 | `tab` | — | — | — | PRD #prd-run-ownership；技术设计 §4.1 |
| 文件标签 | `fileTab` | file tab | — | — | PRD #prd-editor；规格 desktop/editor「文件标签」 |
| 预览 | `preview` | — | — | — | 技术设计 §2.1、§4.4 |
| 命令行 | `cli` | — | — | — | PRD #prd-cli；技术设计 §3.2 |
| 智能体 | `agent` | — | — | — | PRD #prd-glossary；技术设计 §5.1 |
| 移到废纸篓 | `trash` | — | 删除到废纸篓 | — | 技术设计 §6.8、§12 第 45 项 |
| 访达 | `fileManager`（文案里写 `{term_fileManager}`） | Finder | — | — | 负责人 2026-10-12 决定；技术设计 §6.8 |
| 命令面板 | `commandPalette` | Command Palette | — | — | PRD #prd-editor；规格 desktop/editor「命令面板」 |
| 快速打开 | `quickOpen` | Quick Open | — | — | PRD #prd-editor；规格 desktop/editor「快速打开」 |
| 终端 | `terminal` | Terminal | — | — | PRD #prd-terminal；规格 desktop/terminal |

## 说明

- **自动清理**是每个项目的一个开关（开时带天数），默认关闭。关闭的状态不另起名字：界面上写“—”“关闭”“现在：关闭”，不写“已保留”（负责人 2026-10-18，#395；英文写 Auto-clean，同样不写 Kept）。以前文档里的“已保留”只留在 PRD 修订记录这类历史记载里，所以暂不放进“禁用”列；界面文案改完（#395 的实现 issue）后再考虑加。PRD 的修订记录写明全文去掉了这个属性以前的三种叫法（“临时”“scratch”“到期清理”）；“临时”单独出现时还有“临时目录”这类正当用法，所以检查拦的是“临时项目”。标识符按技术设计 §4.2 的 `playground.json` 字段写；协议定稿时以协议为准并更新这一行。
- **移到废纸篓**：第一版只有 macOS 的“废纸篓”；以后做 Windows 时是“移到回收站”。界面文案里不直接写这两个词，用占位符，由文案包按系统替换（按系统选词的机制第一版只填 macOS 一支）。
- **界面英文**一列目前只有“项目”有明文规定（中文写“项目”，英文写 playground），其余在写界面文案时补。
- **规格里的六个英文结构词**（Requirement、Scenario、WHEN、THEN、MUST、ADDED / MODIFIED / REMOVED Requirements）随规格驱动流程加入时补进这张表。

## 怎么加一条

1. 先确认 PRD 或技术设计里有这个词的定义；没有就先问负责人，不要自己定。
2. 加一行，写明出处（PRD 用锚点）。
3. 有已知的旧叫法或容易混用的词，写进“禁用”两列，用顿号分隔。
4. 运行 `pnpm check`；`terms` 报出的旧叫法在同一次改动里改掉。
