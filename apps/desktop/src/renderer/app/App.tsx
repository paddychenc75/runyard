import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { useSettings } from "../bridge/use-settings.ts";
import { AppFrame } from "./AppFrame.tsx";

// 把设置里的语言和主题交给外框：设置页一改，界面立即换（规格 DESKTOP-SETTINGS-03、04）。
// 设置读到之前用主进程算好的启动信息，第一帧不闪。
export function App({ bridge }: { bridge: DesktopBridge }) {
  const settings = useSettings(bridge);
  const { locale, theme } = bridge.bootstrap;
  // 设置选了“跟随系统”时用启动信息里的（启动参数 --theme 只在这时生效，开发用）
  const chosen = settings.settings?.theme;
  return (
    <AppFrame
      bridge={bridge}
      locale={settings.settings?.language ?? locale}
      theme={
        chosen === undefined
          ? theme
          : chosen === "system"
            ? (bridge.bootstrap.themeFallback ?? theme)
            : chosen
      }
      settings={settings}
    />
  );
}
