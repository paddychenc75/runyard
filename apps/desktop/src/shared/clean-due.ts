import type { PlaygroundRow } from "./library-state.ts";

// “离到期不足一天”的判断，主进程（角标、提示条）和界面（行标签）共用同一份，两边才不会各说各话
// （规格 DESKTOP-LIBRARY-VIEW-57）。起点是最近一次使用，和管理进程的清理判断一致。

export const DAY_MS = 24 * 60 * 60 * 1000;

type CleanFields = Pick<PlaygroundRow, "autoClean" | "lastUsedAt" | "missing">;

/**
 * 离到期不足一天（含已到期但还没清理的）：行标签写“明天清理”，提示条和角标都按它算。
 * 按“剩 N 天”同样的整天算法（设定天数减去已满的天数），所以行里写“剩 1 天”的那一天就是“明天清理”；
 * 没开自动清理、没记天数或找不到文件夹的项目不参与
 */
export function isDueTomorrow(row: CleanFields, now: number): boolean {
  if (!row.autoClean.enabled || row.autoClean.days === null || row.missing) return false;
  return row.autoClean.days - Math.floor(Math.max(0, now - row.lastUsedAt) / DAY_MS) <= 1;
}

/** 已经几天没打开（提示条里的“已 D 天没打开”） */
export function idleDaysOf(row: Pick<PlaygroundRow, "lastUsedAt">, now: number): number {
  return Math.floor(Math.max(0, now - row.lastUsedAt) / DAY_MS);
}
