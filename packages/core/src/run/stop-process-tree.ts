import type { Platform, ProcMarker, ProcRef } from "@runyard/platform";
import { type RunClock, sleepOn } from "./run-clock.ts";
import type { RunStopSpec } from "./run-types.ts";

// 停止一整棵进程树（规格 RUN-LIFECYCLE-14、15、16、20；决策记录 0006）。
// 礼貌请求、等 graceMs、强制结束都由平台层的 terminate 做（它先核对 pid 加启动时间，对不上什么也不碰）；
// 这里负责三件平台层不管的事：把 graceMs 原样交过去，terminate 返回后再确认树真的空了
// （没空就整棵强制结束），等脱离进程组但带运行标记的后代走掉（最多 STRAY_WAIT_LIMIT_MS，
// 还在就结束），以及确认端口在 PORT_RELEASE_LIMIT_MS 内可重新绑定。
// 只等进程的退出，从不等输出管道关闭。

export const PORT_RELEASE_LIMIT_MS = 3000;
export const STRAY_WAIT_LIMIT_MS = 2000;
const POLL_MS = 50;

export type StopOutcome = {
  readonly portReleased: boolean;
  /** 等端口花了多久；没有端口时为 0 */
  readonly portWaitedMs: number;
};

export async function stopProcessTree(
  platform: Platform,
  clock: RunClock,
  ref: ProcRef,
  stop: RunStopSpec,
  port: number | undefined,
  marker: ProcMarker,
): Promise<StopOutcome> {
  await platform.proc.terminate(ref, { mode: stop.mode, graceMs: stop.graceMs });
  if ((await platform.proc.members(ref)).length > 0) {
    await platform.proc.terminate(ref, { mode: "kill", graceMs: 0 });
  }
  await settleStrays(platform, clock, marker);
  if (port === undefined) return { portReleased: true, portWaitedMs: 0 };
  const startedAt = clock.now();
  const deadline = startedAt + PORT_RELEASE_LIMIT_MS;
  while ((await platform.ports.isFree(port)) !== "free") {
    if (clock.now() >= deadline) {
      return { portReleased: false, portWaitedMs: clock.now() - startedAt };
    }
    await sleepOn(clock, POLL_MS);
  }
  return { portReleased: true, portWaitedMs: clock.now() - startedAt };
}

/**
 * 停止之后，脱离了进程组但还带着本次运行标记的进程（如 Next 退出时另起的遥测进程，最长活 0.95 秒）：
 * 先等它们自己走掉，到上限还在的，核对身份后结束。调用方因此可以马上改名、移到废纸篓。
 * 平台读不到环境的进程找不到，这里也就管不到（见 `Platform.proc.findByMarker`）
 */
export async function settleStrays(
  platform: Platform,
  clock: RunClock,
  marker: ProcMarker,
): Promise<void> {
  const deadline = clock.now() + STRAY_WAIT_LIMIT_MS;
  for (;;) {
    const strays = await platform.proc.findByMarker(marker);
    if (strays.length === 0) return;
    if (clock.now() >= deadline) {
      for (const stray of strays)
        await platform.proc.terminate(stray, { mode: "kill", graceMs: 0 });
      return;
    }
    await sleepOn(clock, POLL_MS);
  }
}
