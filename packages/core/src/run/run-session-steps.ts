import type { ManagedProcess, Platform } from "@runyard/platform";
import type { Notice } from "@runyard/protocol";
import { childEnv, RUN_MARKER_VAR } from "./child-env.ts";
import type { RunClock } from "./run-clock.ts";
import { internalFailure } from "./run-failures.ts";
import type {
  PrepareContext,
  PrepareOutcome,
  RunPlan,
  RunPreparer,
  RunSinks,
} from "./run-types.ts";
import { PORT_RELEASE_LIMIT_MS, stopProcessTree } from "./stop-process-tree.ts";

// RunSession 里几段不碰状态机的步骤，拆出来只为了让会话文件保持在行数上限之内。

/** 登记的端口被占用时，告诉事件出口本次改用了哪个端口（规格 RUN-PORTS-06） */
export function announcePortFallback(sinks: RunSinks, runId: string, plan: RunPlan): void {
  const { portFallback, port } = plan;
  if (portFallback === undefined || port === undefined) return;
  sinks.port?.({
    runId,
    wanted: portFallback.wanted,
    actual: port,
    reason: portFallback.reason,
    ...(portFallback.occupant === undefined ? {} : { occupant: portFallback.occupant }),
  });
}

/** 根进程退出后，树里可能还有活着的后代：整棵结束 */
export async function sweepTree(platform: Platform, proc: ManagedProcess): Promise<void> {
  if ((await platform.proc.members(proc.ref)).length > 0) {
    await platform.proc.terminate(proc.ref, { mode: "kill", graceMs: 0 });
  }
}

/**
 * 停止这次运行的进程树并等它退出，返回退出码。
 * 端口没能在上限内空出来时 `log` 一条提示：stop 照常返回，客户端要知道下次启动可能按回退规则换端口
 */
export async function stopRunProcess(args: {
  platform: Platform;
  clock: RunClock;
  runId: string;
  proc: ManagedProcess;
  plan: RunPlan;
  log(notice: Notice): void;
}): Promise<number | null> {
  const { platform, clock, runId, proc, plan, log } = args;
  const outcome = await stopProcessTree(platform, clock, proc.ref, plan.stop, plan.port, {
    name: RUN_MARKER_VAR,
    value: runId,
  });
  if (!outcome.portReleased && plan.port !== undefined) {
    log({
      code: "PORT_NOT_RELEASED",
      params: {
        port: plan.port,
        waitedMs: Math.round(outcome.portWaitedMs),
        limitMs: PORT_RELEASE_LIMIT_MS,
      },
    });
  }
  return (await proc.exited).exitCode;
}

/** 准备阶段抛出任何东西都按内部错误处理，不让它变成未处理的拒绝 */
export async function prepareRun(
  preparer: RunPreparer,
  context: PrepareContext,
): Promise<PrepareOutcome> {
  try {
    return await preparer.prepare(context);
  } catch (error) {
    return { ok: false, failure: internalFailure(context.request.name, error) };
  }
}

/** 起子进程；平台层抛错时把原因交回，由会话决定怎么收尾 */
export function spawnRunProcess(
  platform: Platform,
  runId: string,
  plan: RunPlan,
): { ok: true; proc: ManagedProcess } | { ok: false; error: unknown } {
  try {
    return {
      ok: true,
      proc: platform.exec.spawn({
        argv: [...plan.argv],
        cwd: plan.cwd,
        env: childEnv(plan.env, runId),
        stdin: plan.stdin,
      }),
    };
  } catch (error) {
    return { ok: false, error };
  }
}
