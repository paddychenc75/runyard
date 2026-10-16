import type { Env } from "@runyard/platform";
import type { CreatedBy, Owner } from "@runyard/protocol";

// 谁在用命令行：创建者记进项目，持有者记进运行（规格 CLI-COMMANDS-33 到 37，PRD #prd-cli-creator）。
// 智能体名称的来源按优先级：RUNYARD_AGENT；已知智能体自己的环境变量（CLAUDECODE 为 1 记为 Claude Code）；
// AI_AGENT 的原值。都没有就是命令行用户（kind: "cli"，不带名字）。

export interface Caller {
  readonly createdBy: CreatedBy;
  readonly owner: Owner;
}

function agentName(env: Env): string | undefined {
  const explicit = env.RUNYARD_AGENT?.trim();
  if (explicit) return explicit;
  if (env.CLAUDECODE === "1") return "Claude Code";
  const generic = env.AI_AGENT?.trim();
  return generic ? generic : undefined;
}

/**
 * command 是敲下的命令（命令词加位置参数，不含选项值：备注、变量值里可能有不想落盘的内容），
 * 创建者和持有者记同一份
 */
export function detectCaller(env: Env, command: string): Caller {
  const agent = agentName(env);
  const named = agent === undefined ? {} : { agent };
  return {
    createdBy: { kind: agent === undefined ? "cli" : "agent", ...named, command },
    owner: { kind: "cli", ...named, command },
  };
}
