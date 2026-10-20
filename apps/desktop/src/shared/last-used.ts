import type { PlaygroundRow } from "./library-state.ts";

/**
 * 最近使用的时间（规格 DESKTOP-LIBRARY-VIEW-94）：上次打开和自动清理计时起点（任何一次使用，含命令行运行、创建）
 * 两者中较晚的一个，所以从没在应用里打开过的项目也有时间，不写“—”
 */
export function lastUsedAt(row: Pick<PlaygroundRow, "lastOpenedAt" | "lastUsedAt">): number {
  return Math.max(row.lastOpenedAt ?? 0, row.lastUsedAt);
}
