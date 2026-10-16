import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { AppFrame } from "./AppFrame.tsx";

// 把主进程算好的启动信息交给外框。语言和主题以后由设置页改，到时这里换成状态；现在启动时定死。
export function App({ bridge }: { bridge: DesktopBridge }) {
  const { locale, theme } = bridge.bootstrap;
  return <AppFrame bridge={bridge} locale={locale} theme={theme} />;
}
