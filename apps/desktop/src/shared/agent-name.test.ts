import { describe, expect, it } from "vitest";
import { agentDisplayName } from "./agent-name.ts";

describe("智能体名称的显示", () => {
  it("[DESKTOP-LIBRARY-VIEW-101] 带版本后缀的标识显示成名字", () => {
    expect(agentDisplayName("claude-code_2-1-2")).toBe("Claude Code");
    expect(agentDisplayName("claude-code/2.1.2")).toBe("Claude Code");
    expect(agentDisplayName("claude-code@2.1.2")).toBe("Claude Code");
    expect(agentDisplayName("claude-code")).toBe("Claude Code");
    expect(agentDisplayName("codex_0-34-0")).toBe("Codex");
    expect(agentDisplayName("claude-code_2-1-296_agent")).toBe("Claude Code");
  });

  it("[DESKTOP-LIBRARY-VIEW-101] 不认识的标识按单词首字母大写；已经是名字的只去版本", () => {
    expect(agentDisplayName("my-agent_1-0-0")).toBe("My Agent");
    expect(agentDisplayName("Claude Code")).toBe("Claude Code");
    expect(agentDisplayName("Claude Code 2.1.2")).toBe("Claude Code");
    expect(agentDisplayName("Claude Code v2.1.2")).toBe("Claude Code");
  });

  it("整串只有版本号时原样显示，不显示空白", () => {
    expect(agentDisplayName("2.1.2")).toBe("2.1.2");
  });
});
