import type { Platform, ProcRef } from "@runyard/platform";
import { type RunClock, sleepOn } from "./run-clock.ts";
import type { RunStopSpec } from "./run-types.ts";

// 停止一整棵进程树（规格 RUN-LIFECYCLE-14、15、16；决策记录 0006）。
// 礼貌请求、等 graceMs、强制结束都由平台层的 terminate 做（它先核对 pid 加启动时间，对不上什么也不碰）；
// 这里负责三件平台层不管的事：把 graceMs 原样交过去，terminate 返回后再确认树真的空了
// （没空就整棵强制结束），以及确认端口在 PORT_RELEASE_LIMIT_MS 内可重新绑定。
// 只等进程的退出，从不等输出管道关闭。

export const PORT_RELEASE_LIMIT_MS = 3000;
const PORT_POLL_MS = 50;

export type StopOutcome = { readonly portReleased: boolean };

export async function stopProcessTree(
  platform: Platform,
  clock: RunClock,
  ref: ProcRef,
  stop: RunStopSpec,
  port: number | undefined,
): Promise<StopOutcome> {
  await platform.proc.terminate(ref, { mode: stop.mode, graceMs: stop.graceMs });
  if ((await platform.proc.members(ref)).length > 0) {
    await platform.proc.terminate(ref, { mode: "kill", graceMs: 0 });
  }
  if (port === undefined) return { portReleased: true };
  const deadline = clock.now() + PORT_RELEASE_LIMIT_MS;
  while ((await platform.ports.isFree(port)) !== "free") {
    if (clock.now() >= deadline) return { portReleased: false };
    await sleepOn(clock, PORT_POLL_MS);
  }
  return { portReleased: true };
}
