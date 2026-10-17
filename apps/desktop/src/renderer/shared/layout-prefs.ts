import { useCallback, useState } from "react";
import type { PanePrefs } from "../../shared/pane-sizes.ts";

// 窗口版面的偏好（规格 DESKTOP-LIBRARY-VIEW-62、DESKTOP-WORKSPACE-60）：侧栏收起与否、各面板被拖成的尺寸。
// 只是便利，不是要紧的数据，所以存在界面自己的浏览器存储里；读写失败（隐私模式、被禁用）就用默认值，不影响使用。

export interface LayoutPrefs extends PanePrefs {
  sidebarCollapsed: boolean;
}

export const defaultLayoutPrefs: LayoutPrefs = {
  sidebarCollapsed: false,
  treeCollapsed: false,
  treeWidth: null,
  previewWidth: null,
  consoleHeight: null,
};

const KEY = "runyard.layout.v1";

const sizeOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

export function loadLayoutPrefs(): LayoutPrefs {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return defaultLayoutPrefs;
    const saved = raw as Record<string, unknown>;
    return {
      sidebarCollapsed: saved.sidebarCollapsed === true,
      treeCollapsed: saved.treeCollapsed === true,
      treeWidth: sizeOrNull(saved.treeWidth),
      previewWidth: sizeOrNull(saved.previewWidth),
      consoleHeight: sizeOrNull(saved.consoleHeight),
    };
  } catch {
    return defaultLayoutPrefs;
  }
}

function saveLayoutPrefs(prefs: LayoutPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 存不了就只在这次运行里生效
  }
}

export function useLayoutPrefs(): [LayoutPrefs, (patch: Partial<LayoutPrefs>) => void] {
  const [prefs, setPrefs] = useState(loadLayoutPrefs);
  const patch = useCallback((change: Partial<LayoutPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...change };
      saveLayoutPrefs(next);
      return next;
    });
  }, []);
  return [prefs, patch];
}
