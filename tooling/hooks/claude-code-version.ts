// 从环境变量 AI_AGENT 里读 Claude Code 的版本（K15 在 Claude Code 2.1.296 的会话里观察到
// AI_AGENT=claude-code_2-1-296_agent；别的版本是否也设了这个变量没有验证，所以这是尽力而为的提醒）。
// 低于 2.1.277 的 Claude Code 不读 AGENTS.md，而 no-claude-md 检查看不出来（技术设计 §9.2 陷阱三）。

export const MIN_AGENTS_MD_VERSION = [2, 1, 277] as const;

// 返回过低的版本号（如 "2.1.200"）；版本够新、变量不存在或读不出版本时返回 undefined
export function tooOldClaudeCode(env: Record<string, string | undefined>): string | undefined {
  const match = /^claude-code_(\d+)-(\d+)-(\d+)/.exec(env.AI_AGENT ?? "");
  if (match === null) return undefined;
  const version = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let i = 0; i < 3; i++) {
    const have = version[i] as number;
    const need = MIN_AGENTS_MD_VERSION[i] as number;
    if (have !== need) return have < need ? version.join(".") : undefined;
  }
  return undefined;
}
