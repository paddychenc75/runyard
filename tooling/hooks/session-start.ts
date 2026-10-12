import { homedir } from "node:os";
import { findClaudeMd } from "../checks/no-claude-md.ts";
import { tooOldClaudeCode } from "./claude-code-version.ts";
import { REPO_ROOT } from "./hook-input.ts";

// 会话开始时的钩子（SessionStart）：检查有没有会让 AGENTS.md 失效的文件（技术设计 §9.2 陷阱一）。
// 查到就把警告打印到标准输出；SessionStart 钩子的标准输出会进入智能体的上下文（官方文档）。
// 只提醒，不拦：退出码永远是 0。

const problems = findClaudeMd(REPO_ROOT, { ancestors: true, home: homedir() });
// 第三种静默失效的情形：Claude Code 版本太低，只读 CLAUDE.md（决策记录 0004、0011）。尽力而为
const oldVersion = tooOldClaudeCode(process.env);
if (oldVersion !== undefined) {
  problems.push(`Claude Code ${oldVersion} 低于 2.1.277，不会读 AGENTS.md。升级到 2.1.285 以上。`);
}
if (problems.length > 0) {
  console.log(
    [
      "警告：这个会话很可能没有加载仓库的 AGENTS.md。原因：",
      ...problems.map((problem) => `- ${problem}`),
      "在继续之前，请先读仓库根目录的 AGENTS.md，并把这条警告告诉用户。",
    ].join("\n"),
  );
}
