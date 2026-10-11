import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { listFiles } from "./docs.ts";
import type { Check } from "./workspace.ts";

// no-claude-md：没有会让 AGENTS.md 失效的文件（技术设计 §9.2 陷阱一、§9.4）。
// 工作目录或任何上级目录里有 CLAUDE.md、CLAUDE.local.md，或 .claude 目录下的 CLAUDE.md，
// Claude Code 默认就只读它，不再读 AGENTS.md。
// 仓库内：三种文件都查，连没被 git 跟踪的也查（CLAUDE.local.md 通常被忽略，CI 看不到）。
// 本地运行（没有 CI 环境变量）时再沿上级目录一直查到主目录。
// 主目录下 .claude 里的 CLAUDE.md 是个人偏好文件，不影响 AGENTS.md，不算。

const NAMES = new Set(["claude.md", "claude.local.md"]);
const FIX =
  "删掉或改名这个文件；个人偏好放到主目录的 ~/.claude/CLAUDE.md，或把 Claude Code 的 Project instructions 设置改为 claude-md-and-agents-md（两种文件都读）。";

export function findClaudeMd(
  root: string,
  options: { ancestors: boolean; home: string },
): string[] {
  const errors: string[] = [];
  for (const file of listFiles(root)) {
    const name = file.slice(file.lastIndexOf("/") + 1).toLowerCase();
    if (NAMES.has(name)) {
      errors.push(`仓库里出现了 ${file}，它会让 Claude Code 不再读 AGENTS.md。${FIX}`);
    }
  }
  if (!options.ancestors) return errors;
  const home = resolve(options.home);
  let dir = dirname(resolve(root));
  for (;;) {
    const candidates = ["CLAUDE.md", "CLAUDE.local.md"];
    if (dir !== home) candidates.push(join(".claude", "CLAUDE.md"));
    for (const candidate of candidates) {
      const path = join(dir, candidate);
      if (existsSync(path)) {
        errors.push(
          `上级目录里有 ${path}，在这个仓库里工作时 Claude Code 会只读它、不读 AGENTS.md。${FIX}`,
        );
      }
    }
    const parent = dirname(dir);
    if (dir === home || parent === dir) break;
    dir = parent;
  }
  return errors;
}

export const noClaudeMd: Check = {
  name: "no-claude-md",
  run: (root) => findClaudeMd(root, { ancestors: process.env.CI === undefined, home: homedir() }),
};
