import type { AbsPath, Env, Platform } from "@runyard/platform";
import type { LogEntry } from "@runyard/protocol";
import type { RunClock } from "../run/run-clock.ts";
import { runCommand } from "../run/run-command.ts";

// 脚本的语法检查（规格 RUN-SCRIPTS-15 到 19；技术设计 §4.4 的 check）：
// 运行器声明了 check 才执行；以非 0 退出就是没通过。命令由运行器给（`.ts` 用 stripTypeScriptTypes，
// 不是 node --check，见决策记录 0011），这里只负责执行和收集输出。

export const DEFAULT_CHECK_TIMEOUT_MS = 5000;

export type CheckResult = {
  readonly ok: boolean;
  /** 检查的命令行和输出，按日志条目的形状，用来追加进上一次运行的日志 */
  readonly entries: readonly LogEntry[];
  /** 清洗后的末尾几行，放进 SCRIPT_ERRORED 的 cause.outputTail */
  readonly outputTail: string;
};

export async function checkScript(input: {
  readonly platform: Platform;
  readonly clock: RunClock;
  readonly argv: readonly string[];
  readonly cwd: AbsPath;
  readonly env: Env;
  readonly timeoutMs?: number;
}): Promise<CheckResult> {
  const entries: LogEntry[] = [
    { at: input.clock.now(), kind: "command", text: input.argv.join(" ") },
  ];
  const result = await runCommand({
    platform: input.platform,
    clock: input.clock,
    argv: input.argv,
    cwd: input.cwd,
    env: input.env,
    timeoutMs: input.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS,
    onEntry: (entry) => entries.push(entry),
  });
  const ok = result.exitCode === 0 && !result.spawnFailed && !result.timedOut;
  return { ok, entries, outputTail: result.tail };
}
