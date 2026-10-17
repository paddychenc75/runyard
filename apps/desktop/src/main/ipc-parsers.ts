import type { QuitReply } from "../shared/desktop-bridge.ts";
import type { Bounds } from "../shared/layout.ts";

// 界面发来的数据不可信：这里把形状不对的一律挡掉。

export function parseBounds(value: unknown): Bounds | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  const numbers = [x, y, width, height];
  if (!numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if ((width as number) < 0 || (height as number) < 0) return null;
  return { x: x as number, y: y as number, width: width as number, height: height as number };
}

/** 退出回执：形状不对一律不要（页面发来的数据不可信） */
export function parseQuitReply(value: unknown): QuitReply | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, reply } = value as Record<string, unknown>;
  if (typeof id !== "number" || !Number.isInteger(id)) return null;
  if (reply !== "ack" && reply !== "proceed" && reply !== "cancel") return null;
  return { id, reply };
}
