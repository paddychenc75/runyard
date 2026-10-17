// 终端里的按键归谁管（规格 DESKTOP-TERMINAL-15、20）：
// ⌘C 复制、⌘V 粘贴、⌘A 全选、⌘K 清屏、⌘F 查找、⌘G / ⇧⌘G 找下一个、上一个由终端自己处理；
// 别的 ⌘ 组合（⌘P、⇧⌘P、⌘W、⌘S、⌘N……）是应用级快捷键，终端一个字符都不吞，原样放行；
// ⌃ 组合（⌃C 等）和普通按键原样交给 shell。⌃` 是“终端与编辑器之间切换焦点”，也归应用。

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type TerminalCommand =
  | "copy"
  | "paste"
  | "selectAll"
  | "clear"
  | "find"
  | "findNext"
  | "findPrevious";

export type KeyRoute =
  /** 终端自己做这件事，按键到此为止 */
  | { route: "terminal"; command: TerminalCommand }
  /** 应用级快捷键：终端不处理、不拦截，让它继续往外走 */
  | { route: "app" }
  /** 交给 xterm 照常处理（发给 shell 或本地的光标移动） */
  | { route: "shell" };

export function routeKey(event: KeyLike, modKey: "meta" | "ctrl"): KeyRoute {
  if (event.ctrlKey && !event.metaKey && !event.altKey && event.key === "`") {
    return { route: "app" };
  }
  // 第一版只有 macOS（决策记录 0013）：别的系统没有 ⌘，按键全部交给 shell
  if (modKey !== "meta" || !event.metaKey) return { route: "shell" };
  if (event.altKey || event.ctrlKey) return { route: "app" };
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    return key === "g" ? { route: "terminal", command: "findPrevious" } : { route: "app" };
  }
  switch (key) {
    case "c":
      return { route: "terminal", command: "copy" };
    case "v":
      return { route: "terminal", command: "paste" };
    case "a":
      return { route: "terminal", command: "selectAll" };
    case "k":
      return { route: "terminal", command: "clear" };
    case "f":
      return { route: "terminal", command: "find" };
    case "g":
      return { route: "terminal", command: "findNext" };
    default:
      return { route: "app" };
  }
}
