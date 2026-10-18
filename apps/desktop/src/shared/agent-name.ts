// 智能体名称的显示（规格 DESKTOP-LIBRARY-VIEW-101）：命令行记下的可能是环境变量里的原始标识，
// 带版本后缀，如 `claude-code_2-1-2`、`claude-code/2.1.2`；界面一律显示去掉版本的名字。
// 已经是人读的名字（含大写或空格，如 `Claude Code`）只去掉末尾的版本号，不改写。

const KNOWN: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
  "gemini-cli": "Gemini CLI",
  copilot: "Copilot",
  windsurf: "Windsurf",
  aider: "Aider",
};

/** 末尾的版本：`_2-1-2`、`/2.1.2`、`@2.1.2`、` v2.1.2`、`-2.1.2` */
const VERSION_SUFFIX = /[\s_/@-]+v?\d+(?:[.\-_]\d+)*$/i;

const AGENT_SUFFIX = /[_-]agent$/i;

export function agentDisplayName(raw: string): string {
  const trimmed = raw.trim();
  // 有的智能体外壳写成 `claude-code_2-1-296_agent`：先去掉末尾的 `_agent`，再去版本
  const base = trimmed.replace(AGENT_SUFFIX, "").replace(VERSION_SUFFIX, "");
  // 去完版本什么都不剩（整串就是个版本号）：原样显示，不显示空白
  if (base === "") return trimmed;
  if (/[A-Z\s]/.test(base)) return base;
  const known = KNOWN[base.toLowerCase()];
  if (known !== undefined) return known;
  return base
    .split(/[-_]+/)
    .filter((word) => word !== "")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
