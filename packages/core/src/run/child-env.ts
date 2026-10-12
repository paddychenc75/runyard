import type { Env } from "@runyard/platform";

// 子进程环境的最后一道关（规格 RUN-LIFECYCLE-25，决策记录 0005）。
// 完整的环境由 #36 构造；这里只做两件必须在启动处做的事：
// 去掉管理进程自己的 ELECTRON_RUN_AS_NODE（漏了它，用户的 node 会当成 Electron 跑），
// 放上运行标记（决策记录 0006：改名、删除之前靠它在全机找脱离进程组的后代）。

export const RUN_MARKER_VAR = "RUNYARD_RUN_ID";

export function childEnv(base: Env, runId: string): Env {
  const env: Record<string, string> = { ...base };
  delete env.ELECTRON_RUN_AS_NODE;
  env[RUN_MARKER_VAR] = runId;
  return env;
}
