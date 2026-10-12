import { describe, expect, it } from "vitest";
import { tooOldClaudeCode } from "./claude-code-version.ts";

const agent = (value: string | undefined) => ({ AI_AGENT: value });

describe("tooOldClaudeCode", () => {
  it("低于 2.1.277 的版本返回版本号", () => {
    expect(tooOldClaudeCode(agent("claude-code_2-1-276_agent"))).toBe("2.1.276");
    expect(tooOldClaudeCode(agent("claude-code_2-0-999"))).toBe("2.0.999");
    expect(tooOldClaudeCode(agent("claude-code_1-9-9_agent"))).toBe("1.9.9");
  });

  it("刚好 2.1.277 和更新的版本不提醒", () => {
    expect(tooOldClaudeCode(agent("claude-code_2-1-277_agent"))).toBeUndefined();
    expect(tooOldClaudeCode(agent("claude-code_2-1-296_agent"))).toBeUndefined();
    expect(tooOldClaudeCode(agent("claude-code_2-2-0_agent"))).toBeUndefined();
    expect(tooOldClaudeCode(agent("claude-code_3-0-0_agent"))).toBeUndefined();
  });

  it("变量不存在或读不出版本时不提醒", () => {
    expect(tooOldClaudeCode({})).toBeUndefined();
    expect(tooOldClaudeCode(agent(undefined))).toBeUndefined();
    expect(tooOldClaudeCode(agent("codex_1-2-3"))).toBeUndefined();
    expect(tooOldClaudeCode(agent("claude-code_unknown"))).toBeUndefined();
  });
});
