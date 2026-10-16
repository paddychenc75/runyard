import { type AbsPath, absPath, type Platform, supervisorLogPath } from "@runyard/platform";

// supervisor.log 的轮转（storage.md 2.5；定下“未定”第 1 条）。
// 启动者（平台层的 spawnDetached）以追加方式打开这个文件，管理进程的标准输出和标准错误一直写进去，
// 所以不能把它改名——改名后管理进程仍写进改名后的文件。办法是“复制再清空”：
// 内容复制到 .1（原来的 .1 顺延到 .2……），再把原文件截为空；追加方式打开的描述符之后从新的末尾继续写。
// 复制与清空之间管理进程自己写的几行会丢；轮转只在启动时做，那时只有启动阶段的几行诊断。

/** 单个文件超过它就轮转 */
export const SUPERVISOR_LOG_MAX_BYTES = 5 * 1024 * 1024;
/** 保留几份轮转出来的旧文件（.1 到 .3） */
export const SUPERVISOR_LOG_KEPT = 3;

const rotated = (log: AbsPath, n: number): AbsPath => absPath(`${log}.${n}`);

export async function rotateSupervisorLog(
  platform: Platform,
  options: { maxBytes?: number; kept?: number } = {},
): Promise<boolean> {
  const maxBytes = options.maxBytes ?? SUPERVISOR_LOG_MAX_BYTES;
  const kept = options.kept ?? SUPERVISOR_LOG_KEPT;
  const log = supervisorLogPath(platform.paths.stateDir);
  const current = await platform.fs.readBytes(log);
  if (current === null || current.length <= maxBytes) return false;
  // 从最老的开始顺延，最老的那份被盖掉
  for (let n = kept - 1; n >= 1; n -= 1) {
    const older = await platform.fs.readBytes(rotated(log, n));
    if (older !== null) await platform.fs.writeFile(rotated(log, n + 1), older);
  }
  await platform.fs.writeFile(rotated(log, 1), current);
  await platform.fs.writeFile(log, "");
  return true;
}
