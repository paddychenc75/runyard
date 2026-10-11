import { describe, expect, it } from "vitest";
import { agentsConfig, checkAgentFile } from "./agents-config.ts";
import { makeRepo } from "./test-helpers.ts";

const agent = (extra = "", body = "先读根 AGENTS.md。\n") =>
  `---\nname: reviewer\ndescription: 只读审查\n${extra}---\n\n${body}`;

describe("agents-config 检查", () => {
  it("合法的子智能体定义通过；没有子智能体时也通过", () => {
    expect(agentsConfig.run(makeRepo({ ".claude/agents/reviewer.md": agent() }))).toEqual([]);
    expect(agentsConfig.run(makeRepo({ "AGENTS.md": "x\n" }))).toEqual([]);
  });

  it("开了跳过项目说明（omitClaudeMd）", () => {
    const root = makeRepo({ ".claude/agents/reviewer.md": agent("omitClaudeMd: true\n") });
    expect(agentsConfig.run(root).join()).toContain("设了 omitClaudeMd");
  });

  it("缺 frontmatter、缺字段、正文没提 AGENTS.md", () => {
    expect(checkAgentFile("a.md", "没有 frontmatter\n").join()).toContain("没有 frontmatter");
    expect(checkAgentFile("a.md", "---\nname: a\n---\n先读 AGENTS.md\n").join()).toContain(
      "缺 description",
    );
    expect(checkAgentFile("a.md", agent("", "直接开始干活。\n")).join()).toContain(
      "没有提到 AGENTS.md",
    );
  });
});
