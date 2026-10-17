import { useSyncExternalStore } from "react";

// 底部面板此刻显示“输出”还是“终端”（规格 DESKTOP-TERMINAL-01、06）：
// 只记在这次运行的内存里，每个项目一份。切到别的标签页再回来保持原样；重新打开应用恢复标签页时
// 永远是“输出”，不会自动创建终端。

export type PanelMode = "output" | "terminal";

const modes = new Map<string, PanelMode>();
const listeners = new Set<() => void>();

export function panelModeOf(project: string): PanelMode {
  return modes.get(project) ?? "output";
}

export function setPanelMode(project: string, mode: PanelMode): void {
  if (panelModeOf(project) === mode) return;
  modes.set(project, mode);
  for (const listener of listeners) listener();
}

/** 项目的标签页关了：终端也结束了，下次打开从“输出”开始 */
export function forgetPanelMode(project: string): void {
  if (modes.delete(project)) for (const listener of listeners) listener();
}

export function usePanelMode(project: string): PanelMode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => panelModeOf(project),
  );
}
