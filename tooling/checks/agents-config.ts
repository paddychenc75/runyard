import { parse } from "yaml";
import { listFiles, readText } from "./docs.ts";
import type { Check } from "./workspace.ts";

// agents-config：子智能体没有开“跳过项目说明”（技术设计 §9.2 陷阱二、§9.4）。
// Claude Code 的子智能体定义（.claude 目录下 agents 里的 Markdown）有一个字段 omitClaudeMd，
// 设为 true 时子智能体启动不加载项目说明，AGENTS.md 也一起被跳过
//（字段名 2026-10-12 对照官方文档 code.claude.com/docs/en/sub-agents 核实）。
// 另查两件事：frontmatter 里有 name 和 description；正文提到 AGENTS.md（要求它先读）。

const AGENTS_DIR = ".claude/agents/";

export function checkAgentFile(file: string, text: string): string[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null) {
    return [
      `${file} 开头没有 frontmatter（两行 --- 之间的 YAML）。补上，至少写 name 和 description。`,
    ];
  }
  let meta: Record<string, unknown>;
  try {
    meta = (parse(match[1] as string) ?? {}) as Record<string, unknown>;
  } catch {
    return [`${file} 的 frontmatter 不是合法的 YAML。改正后再提交。`];
  }
  const errors: string[] = [];
  if ("omitClaudeMd" in meta) {
    errors.push(
      `${file} 设了 omitClaudeMd。删掉这个字段：开了它，子智能体干活时就没有 AGENTS.md 里的规则在上下文里（技术设计 §9.2 陷阱二）。`,
    );
  }
  for (const key of ["name", "description"]) {
    if (typeof meta[key] !== "string" || meta[key] === "") {
      errors.push(`${file} 的 frontmatter 缺 ${key}。补上。`);
    }
  }
  if (!(match[2] as string).includes("AGENTS.md")) {
    errors.push(
      `${file} 的正文没有提到 AGENTS.md。在第一句写明“先读根 AGENTS.md 和所改目录的 AGENTS.md”。`,
    );
  }
  return errors;
}

export const agentsConfig: Check = {
  name: "agents-config",
  run(root) {
    return listFiles(root)
      .filter((file) => file.startsWith(AGENTS_DIR) && file.endsWith(".md"))
      .flatMap((file) => checkAgentFile(file, readText(root, file)));
  },
};
