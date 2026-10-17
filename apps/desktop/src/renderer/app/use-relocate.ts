import { useCallback, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError } from "../../shared/library-state.ts";

export interface Relocate {
  /** 选了别的项目的文件夹，说明“这个文件夹不是 <名称>”要显示在哪个项目上；没有是 null */
  mismatchId: string | null;
  /** 其他失败（读不了、版本不对……）；没有是 null */
  failed: DesktopError | null;
  clearFailed: () => void;
  relocate: (id: string) => Promise<void>;
  forget: (id: string) => Promise<void>;
}

// 找不到文件夹的项目的两个动作（规格 DESKTOP-LIBRARY-VIEW-50 至 52）。重新定位由主进程弹文件夹选择器，
// 管理进程核对里面的项目标识：对不上它回“项目不存在”，在这里就是“选错了文件夹”，什么都没改；
// 取消选择器什么都不发生。从资源库移除只去掉这一项，不动磁盘。
export function useRelocate(bridge: DesktopBridge): Relocate {
  const [mismatchId, setMismatchId] = useState<string | null>(null);
  const [failed, setFailed] = useState<DesktopError | null>(null);
  const relocate = useCallback(
    async (id: string) => {
      setMismatchId(null);
      const result = await bridge.call("playground.relocate", id);
      if (result.ok) return;
      if (result.error.code === "PLAYGROUND_NOT_FOUND") setMismatchId(id);
      else setFailed(result.error);
    },
    [bridge],
  );
  const forget = useCallback(
    async (id: string) => {
      const result = await bridge.call("playground.forget", id);
      if (!result.ok) setFailed(result.error);
    },
    [bridge],
  );
  const clearFailed = useCallback(() => setFailed(null), []);
  return { mismatchId, failed, clearFailed, relocate, forget };
}
