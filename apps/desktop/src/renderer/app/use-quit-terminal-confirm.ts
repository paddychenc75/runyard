import { useCallback, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TerminalBusy } from "../../shared/terminal.ts";

/** 退出保存流程完成后再询问仍在终端里运行的命令；设置页也保留同一退出门槛。 */
export function useQuitTerminalConfirm(bridge: DesktopBridge) {
  const [quitAsk, setQuitAsk] = useState<{
    busy: TerminalBusy[];
    answer: (quit: boolean) => void;
  } | null>(null);
  const askQuit = useCallback(async (): Promise<boolean> => {
    const busy = (await bridge.call("terminal.busy").catch(() => [])) ?? [];
    if (busy.length === 0) return true;
    return await new Promise<boolean>((resolve) => {
      setQuitAsk({
        busy,
        answer: (quit) => {
          setQuitAsk(null);
          resolve(quit);
        },
      });
    });
  }, [bridge]);
  return { quitAsk, askQuit };
}
