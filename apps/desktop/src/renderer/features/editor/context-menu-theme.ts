// 编辑器右键菜单的主题（issue #566）。
// 根因：Monaco 把右键菜单画在 shadow DOM 里（宿主 .shadow-root-host，fixed 定位，所以不会被编辑器卡片的 overflow 裁掉）。
// shadow 里只有 Monaco 自己塞进去的菜单样式，拿不到文档里的主题变量（--vscode-menu-*），文档里的样式也穿不进去，
// 结果菜单没有底色、边框和阴影，深色下是黑字压深色背景。
// 办法：菜单宿主出现时，往它的 shadow root 里放一段我们自己的样式；自定义属性能穿过 shadow 边界，
// 所以直接引用设计变量，浅色深色由变量自己切换。样式只改外观，不改菜单的结构和行为。

// color-scheme: inherit 不能省：Monaco 的第一条规则是 all: initial，会把 color-scheme 也重置成浅色，light-dark() 就永远取浅色那一半
export const CONTEXT_MENU_CSS = `
:host {
  color-scheme: inherit;
  --vscode-menu-background: var(--glass-dialog-bg);
  --vscode-menu-foreground: var(--color-text-primary);
  --vscode-menu-selectionBackground: var(--color-fill-accent);
  --vscode-menu-selectionForeground: var(--color-text-on-accent);
  --vscode-menu-separatorBackground: var(--color-line-hairline);
  --vscode-menu-border: transparent;
  --vscode-disabledForeground: var(--color-text-tertiary);
  --vscode-cornerRadius-large: var(--radius-menu);
  --vscode-strokeThickness: 0px;
  font-family: var(--font-sans);
}
.context-view { z-index: var(--z-popover); }
.monaco-menu {
  font-family: var(--font-sans);
  font-size: var(--text-body-size);
  min-width: var(--size-menu-min);
  padding: var(--space-3);
  box-sizing: border-box;
  color: var(--color-text-primary);
  background: var(--glass-dialog-bg);
  backdrop-filter: var(--glass-blur-menu);
  border-radius: var(--radius-menu);
  box-shadow: var(--shadow-overlay);
}
.monaco-menu .monaco-action-bar .action-item .action-menu-item { border-radius: var(--radius-sm); }
.monaco-menu .monaco-action-bar .action-item .keybinding { font-size: var(--text-caption-size); }
@media (prefers-reduced-transparency: reduce) {
  .monaco-menu { backdrop-filter: none; background: var(--color-bg-card); }
}
`;

const HOST = ".shadow-root-host";

/**
 * 盯着编辑器容器：菜单宿主一出现就给它的 shadow root 放上主题样式，并在菜单打开、关闭时通知（同一个宿主复用，只放一次）。
 * 菜单打开时界面要报“有浮层”，原生预览才会让位，否则伸到预览上的那一截会被预览盖住（#566）。
 */
export function watchContextMenu(
  container: HTMLElement,
  onOpenChange: (open: boolean) => void,
): { dispose(): void } {
  let open = false;
  const check = () => {
    const host = container.querySelector(HOST);
    const now = host?.shadowRoot?.querySelector(".monaco-menu") != null;
    if (now === open) return;
    open = now;
    onOpenChange(open);
  };
  const inner = new MutationObserver(check);
  const watched = new WeakSet<ShadowRoot>();
  const attach = () => {
    const root = container.querySelector(HOST)?.shadowRoot;
    if (!root || watched.has(root)) return;
    watched.add(root);
    const style = container.ownerDocument.createElement("style");
    style.textContent = CONTEXT_MENU_CSS;
    root.append(style);
    inner.observe(root, { childList: true, subtree: true });
    // 宿主是第一次弹菜单时才建的：观察开始前菜单可能已经在里面了
    check();
  };
  const outer = new MutationObserver(attach);
  outer.observe(container, { childList: true });
  attach();
  return {
    dispose() {
      outer.disconnect();
      inner.disconnect();
      if (open) onOpenChange(false);
    },
  };
}
