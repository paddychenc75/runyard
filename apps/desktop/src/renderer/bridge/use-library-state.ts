import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";

/** 订阅主进程推来的资源库状态；第一次推送之前是 null（界面按空状态画，不闪） */
export function useLibraryState(bridge: DesktopBridge): LibraryState | null {
  const [state, setState] = useState<LibraryState | null>(null);
  useEffect(() => {
    const stop = bridge.on("library.changed", setState);
    void bridge.call("library.get").then(setState);
    return stop;
  }, [bridge]);
  return state;
}
