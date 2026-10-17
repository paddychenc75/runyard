import { supervisorLogPath } from "@runyard/platform";
import type { SupervisorStartFailure } from "@runyard/protocol";
import type { ResolvedOptions } from "./connect-options.ts";

// 管理进程启动失败的原因（规格 SUPERVISOR-LIFECYCLE-22）。入口启动失败时往标准错误写一行
// `startup failed: <代码>: <诊断>`（supervisor 的 run-main.ts），标准错误被追加到 supervisor.log。
// 启动者与管理进程脱钩、拿不到退出码，所以拉起前记下日志的长度，超时后只读这次新增的部分。

const FAILURE_LINE = /startup failed: (?:([A-Z][A-Z_]+):)?/;

/** 拉起之前日志文件的字节数；读不到当作 0 */
export async function logSize(ctx: ResolvedOptions): Promise<number> {
  const { platform } = ctx;
  try {
    return (await platform.fs.readBytes(supervisorLogPath(platform.paths.stateDir)))?.length ?? 0;
  } catch {
    return 0;
  }
}

/** 这次拉起之后日志里的启动失败原因；没有记录（或读不到）返回 undefined */
export async function startupFailure(
  ctx: ResolvedOptions,
  sizeBefore: number,
): Promise<SupervisorStartFailure | undefined> {
  const { platform } = ctx;
  try {
    const bytes = await platform.fs.readBytes(supervisorLogPath(platform.paths.stateDir));
    if (bytes === null) return undefined;
    // 日志轮转后文件变小：整份都算这次的
    const added = bytes.length >= sizeBefore ? bytes.subarray(sizeBefore) : bytes;
    const lines = new TextDecoder().decode(added).split("\n");
    const last = lines.filter((line) => FAILURE_LINE.test(line)).at(-1);
    if (last === undefined) return undefined;
    return last.match(FAILURE_LINE)?.[1] === "PATH_TOO_LONG" ? "PATH_TOO_LONG" : "STARTUP_FAILED";
  } catch {
    return undefined;
  }
}
