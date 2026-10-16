import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

// 全仓库唯一碰 window.runyard 的地方（技术设计 §6.7 的 bridge/）：别处从这里拿，测试里传假的。
export function getBridge(): DesktopBridge {
  return window.runyard;
}
