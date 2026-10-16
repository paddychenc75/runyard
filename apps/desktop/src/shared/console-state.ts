import type { LogEntry } from "@runyard/protocol";

// 控制台（每个标签页的进程输出）在主进程和界面之间的数据形状。
// 条目是管理进程读取时清洗过的文本（规格 run/logs）；seq 是主进程给每一行编的号，
// 界面靠它把“先拿的快照”和“后到的推送”接起来而不重复、不漏行。

export interface ConsoleLine {
  seq: number;
  entry: LogEntry;
}

/** 主进程推给界面的新输出；reset 为 true 时 lines 是这个项目的全部输出，替换界面手里的 */
export interface ConsoleAppend {
  playground: string;
  lines: ConsoleLine[];
  reset: boolean;
}

/** 把一次推送或一份快照并进已有的行：整体替换，或只接上 seq 更大的 */
export function mergeConsoleLines(
  current: readonly ConsoleLine[],
  incoming: readonly ConsoleLine[],
  reset: boolean,
): ConsoleLine[] {
  if (reset) return [...incoming];
  const last = current.at(-1)?.seq ?? 0;
  const fresh = incoming.filter((line) => line.seq > last);
  return fresh.length === 0 ? [...current] : [...current, ...fresh];
}
