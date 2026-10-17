import type { Settings, SettingsPatch } from "@runyard/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";

export interface SettingsApi {
  /** 第一次读到之前是 null */
  settings: Settings | null;
  /** 改设置：界面先按新值画（立即生效），主进程存好后以它交回的为准 */
  update: (patch: SettingsPatch) => void;
}

/** 订阅主进程的设置；命令行或别处改了设置，开着的设置页跟着更新（规格 DESKTOP-SETTINGS 的“设置是主窗口里的一页”） */
export function useSettings(bridge: DesktopBridge): SettingsApi {
  const [settings, setSettings] = useState<Settings | null>(null);
  // 连续点击时按顺序落：后发的请求不被先发的结果盖掉
  const latest = useRef(0);
  useEffect(() => {
    const stop = bridge.on("settings.changed", setSettings);
    void bridge.call("settings.get").then(
      (read) => setSettings((current) => current ?? read),
      () => {},
    );
    return stop;
  }, [bridge]);
  const update = useCallback(
    (patch: SettingsPatch) => {
      const ticket = ++latest.current;
      setSettings((current) => (current === null ? current : { ...current, ...patch }));
      void bridge.call("settings.set", patch).then(
        (saved) => {
          if (ticket === latest.current) setSettings(saved);
        },
        () => {},
      );
    },
    [bridge],
  );
  return { settings, update };
}
