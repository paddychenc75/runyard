import { useEffect, useState } from "react";

/**
 * 窗口此刻真的看得见吗：关了窗口（macOS 上只是藏起来）或最小化时界面还活着，但用户看不到；
 * “提醒已显示”只能在看得见的时候回报（规格 DESKTOP-LIBRARY-VIEW-58）
 */
export function useWindowVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}
