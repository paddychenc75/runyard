import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findClaudeMd } from "./no-claude-md.ts";
import { makeRepo } from "./test-helpers.ts";

describe("no-claude-md 检查", () => {
  it("只有 AGENTS.md 时通过", () => {
    const home = makeRepo({ "work/repo/AGENTS.md": "# x\n", ".claude/CLAUDE.md": "个人偏好\n" });
    expect(findClaudeMd(join(home, "work/repo"), { ancestors: true, home })).toEqual([]);
  });

  it("仓库里出现 CLAUDE.md、CLAUDE.local.md 或 .claude 下的 CLAUDE.md", () => {
    for (const file of ["CLAUDE.md", "packages/core/CLAUDE.local.md", ".claude/CLAUDE.md"]) {
      const root = makeRepo({ [file]: "x\n" });
      expect(findClaudeMd(root, { ancestors: false, home: root }).join()).toContain(
        `仓库里出现了 ${file}`,
      );
    }
  });

  it("本地运行时沿上级目录查到主目录", () => {
    const home = makeRepo({ "work/repo/AGENTS.md": "# x\n", "work/CLAUDE.local.md": "x\n" });
    const root = join(home, "work/repo");
    expect(findClaudeMd(root, { ancestors: true, home }).join()).toContain("上级目录里有");
    expect(findClaudeMd(root, { ancestors: false, home })).toEqual([]);
  });
});
