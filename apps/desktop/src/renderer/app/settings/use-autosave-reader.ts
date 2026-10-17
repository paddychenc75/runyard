import type { Settings } from "@runyard/protocol";
import { useCallback, useRef } from "react";

/**
 * 编辑器要的“现在是哪一档自动保存”：返回的函数身份不变（编辑器只在创建时拿一次），
 * 每次调用读最新的设置，所以设置页一改，下一次保存就按新档位（规格 DESKTOP-SETTINGS-11）。
 * 设置还没读到时用默认的第一档。
 */
export function useAutoSaveReader(settings: Settings | null): () => Settings["autoSave"] {
  const latest = useRef<Settings["autoSave"]>("delay");
  latest.current = settings?.autoSave ?? "delay";
  return useCallback(() => latest.current, []);
}
