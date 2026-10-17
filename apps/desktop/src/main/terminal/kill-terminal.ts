import type { Platform, ProcRef } from "@runyard/platform";
import { TERMINAL_MARKER_ENV } from "../../shared/terminal.ts";

/**
 * pty-host 崩溃或卡住之后，主进程亲手收拾一个终端留下的一切：先整组结束 shell 所在的进程组（发信号前核对进程身份），
 * 再找出所有带着这个终端标记、脱离了进程组的后代，核对身份后结束。平台层读不到环境的进程找不到，也就管不到。
 */
export async function killTerminal(
  platform: Pick<Platform, "proc">,
  target: { ref: ProcRef | null; marker: string },
): Promise<void> {
  if (target.ref !== null) {
    await platform.proc.terminate(target.ref, { mode: "kill", graceMs: 0 }).catch(() => undefined);
  }
  const strays = await platform.proc
    .findByMarker({ name: TERMINAL_MARKER_ENV, value: target.marker })
    .catch(() => []);
  for (const stray of strays) {
    await platform.proc.terminate(stray, { mode: "kill", graceMs: 0 }).catch(() => undefined);
  }
}
