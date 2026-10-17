import type { SessionState } from "./session-types.ts";

/**
 * 文件或文件夹改名后各文件标签的新路径：路径是它或在它下面的标签换成新路径，
 * 选中的和等着回答的标签跟着换；其余原样（规格 DESKTOP-EDITOR-09、10）。
 */
export function renameTabPaths(
  state: SessionState,
  from: string,
  to: string,
): Pick<SessionState, "tabs" | "active" | "closePrompt"> {
  const move = (path: string): string | null => {
    if (path === from) return to;
    return path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : null;
  };
  const { tabs, active, closePrompt } = state;
  return {
    tabs: tabs.map((tab) => {
      const moved = move(tab.path);
      return moved === null ? tab : { ...tab, path: moved };
    }),
    active: active === null ? null : (move(active) ?? active),
    closePrompt: closePrompt === null ? null : (move(closePrompt) ?? closePrompt),
  };
}
