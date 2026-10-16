import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

// 全仓库唯一读 window.runyard 的地方（技术设计 §6.7 分层表；ui-layers 检查守着）。
// 别处要调主进程，从这里拿带类型的接口。
export function getDesktopBridge(): DesktopBridge {
  return window.runyard;
}
