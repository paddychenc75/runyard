import { lastUsedAt } from "../shared/last-used.ts";
import type { PlaygroundRow } from "../shared/library-state.ts";

// 运行中的排最前，其余按最近使用从新到旧，名字兜底（规格 DESKTOP-LIBRARY-VIEW-01、94）
export function compareRows(a: PlaygroundRow, b: PlaygroundRow): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  const aTime = lastUsedAt(a);
  const bTime = lastUsedAt(b);
  if (aTime !== bTime) return bTime - aTime;
  return a.name.localeCompare(b.name);
}
