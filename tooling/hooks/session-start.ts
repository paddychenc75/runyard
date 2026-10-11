import { homedir } from "node:os";
import { findClaudeMd } from "../checks/no-claude-md.ts";
import { REPO_ROOT } from "./hook-input.ts";

// 会话开始时的钩子（SessionStart）：检查有没有会让 AGENTS.md 失效的文件（技术设计 §9.2 陷阱一）。
// 查到就把警告打印到标准输出；SessionStart 钩子的标准输出会进入智能体的上下文（官方文档）。
// 只提醒，不拦：退出码永远是 0。

const problems = findClaudeMd(REPO_ROOT, { ancestors: true, home: homedir() });
if (problems.length > 0) {
  console.log(
    [
      "警告：这个会话很可能没有加载仓库的 AGENTS.md。原因：",
      ...problems.map((problem) => `- ${problem}`),
      "在继续之前，请先读仓库根目录的 AGENTS.md，并把这条警告告诉用户。",
    ].join("\n"),
  );
}
