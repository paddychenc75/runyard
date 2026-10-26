import type { PlaygroundRow } from "../shared/library-state.ts";

// 大小列和侧栏合计的纯判断（规格 DESKTOP-LIBRARY-VIEW-69 至 77），不碰 DOM、不生成文字。

/** 一格大小要显示什么：数字（不完整时加“≥ ”）、还在计算、找不到文件夹 */
export type SizeCellView =
  | { kind: "bytes"; bytes: number; atLeast: boolean }
  | { kind: "calculating" }
  | { kind: "none" };

export function sizeCellOf(row: PlaygroundRow): SizeCellView {
  if (row.missing) return { kind: "none" };
  if (row.size === undefined || row.size === null) return { kind: "calculating" };
  return { kind: "bytes", bytes: row.size.totalBytes, atLeast: row.size.unreadable > 0 };
}

/** 侧栏底部的合计：找不到文件夹的不算；有项目还在计算就不写合计（规格 -70） */
export function sizeTotalOf(rows: readonly PlaygroundRow[]): {
  bytes: number;
  calculating: boolean;
} {
  let bytes = 0;
  let calculating = false;
  for (const row of rows) {
    const cell = sizeCellOf(row);
    if (cell.kind === "bytes") bytes += cell.bytes;
    else if (cell.kind === "calculating") calculating = true;
  }
  return { bytes, calculating };
}
