# 0004. 给智能体的说明只用 AGENTS.md，不用 CLAUDE.md

状态：已接受

日期：2026-10-12

来源：技术设计 §1 第 7 条、§9.1、§9.2、§9.4、§12“由技术负责人直接决定的事项”

## 背景

这个仓库的代码主要由智能体写，规则要写在智能体每次都会读到的文件里。`AGENTS.md` 是开放格式，Claude Code（2.1.277 起）、Codex、Cursor、Copilot、Gemini CLI 都读。但 Claude Code 有两种情况会让它不声不响地失效：一是工作目录或任何上级目录里有 `CLAUDE.md`、`CLAUDE.local.md`，或 `.claude` 目录下的 `CLAUDE.md` 时，默认只读它们、不再读 `AGENTS.md`；二是设了“跳过项目说明”的子智能体不加载 `AGENTS.md`。

## 决定

只写一种说明文件：`AGENTS.md`。根目录一份（不超过 150 行），每个包一份（不超过 80 行，随包建立时写）。仓库里不放任何 `CLAUDE.md` 或 `CLAUDE.local.md`。要求 Claude Code 2.1.285 以上。

## 后果

- `no-claude-md` 检查：仓库里出现这些文件就红；本地运行时连没被 git 跟踪的也查，并沿上级目录查到主目录。
- 会话开始时的钩子做同样的检查，查到就在会话里打印警告。
- 根 `AGENTS.md` 开头写明不要建 `CLAUDE.local.md`；个人偏好放主目录下 `.claude` 里的 `CLAUDE.md`，或把 Claude Code 的 Project instructions 设置改为 `claude-md-and-agents-md`。
- 子智能体定义都不开“跳过项目说明”（字段名 `omitClaudeMd`），由 `agents-config` 检查拦住；把任务交给临时起的子智能体时，交代里写明先读根 `AGENTS.md` 和所改目录的 `AGENTS.md`。
- 不管说明有没有被读到，`pnpm check` 和 CI 照样拦着：能用检查表达的规则不靠智能体“记得”。
- `.claude` 目录下的 rules 不受影响，照常加载；放在那里的短规则必须同时出现在对应目录的 `AGENTS.md` 里。

## 被否的方案

- 在仓库里放 `CLAUDE.md`（哪怕只是为 Claude Code 另写一份）：只要它存在，Claude Code 默认就不读 `AGENTS.md`，而其他智能体不读它，同一条规则变成两个出处。
