import { createContext, useContext, useEffect } from "react";
import type { Bounds } from "../../shared/layout.ts";
import { OverlayCounter } from "./overlay-counter.ts";

// 外壳提供一个浮层计数器；弹窗、菜单、下拉这类会盖住预览的东西在打开期间调 useOverlay。
export const OverlayContext = createContext<OverlayCounter>(new OverlayCounter());

/** open 为 true 的期间，告诉外壳“有浮层”（可带矩形，不带则按会盖住预览处理） */
export function useOverlay(open: boolean, rect?: Bounds): void {
  const counter = useContext(OverlayContext);
  const key = rect === undefined ? "" : `${rect.x},${rect.y},${rect.width},${rect.height}`;
  // 矩形按内容（key）比较，不按对象引用
  useEffect(() => (open ? counter.acquire(rect) : undefined), [counter, open, key]);
}
