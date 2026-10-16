import type { DesktopBridge } from "../shared/desktop-bridge.ts";

declare global {
  interface Window {
    /** 预加载脚本交出来的窄接口 */
    runyard: DesktopBridge;
  }
}
