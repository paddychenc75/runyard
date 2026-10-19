import { useCallback, useLayoutEffect, useRef, useState } from "react";

// 收列后的表格仍需约742px，加侧栏264px与页边距56px；1100可容纳，1024需临时隐藏。
const MIN_WITH_SIDEBAR = 1062;

/** 自动隐藏只影响本次布局，持久偏好由调用方在宽窗口手动切换时写入。 */
export function useResponsiveSidebar(
  enabled: boolean,
  collapsed: boolean,
  toggleSaved: () => void,
) {
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [opened, setOpened] = useState(false);
  const focusRequest = useRef<"toggle" | "navigation" | null>(null);
  const measuredNarrow = useRef(false);
  const automatic = enabled && narrow;
  const overlay = automatic && opened;
  const visible = automatic ? opened : !collapsed;
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      const next = width > 0 && width < MIN_WITH_SIDEBAR;
      const changesMode = next !== measuredNarrow.current;
      measuredNarrow.current = next;
      const focused = document.activeElement;
      const inSidebar = node.querySelector("[data-library-sidebar]")?.contains(focused);
      const restoringToggle =
        !next &&
        enabled &&
        !collapsed &&
        !inSidebar &&
        focused?.hasAttribute("data-sidebar-toggle");
      if (
        changesMode &&
        (restoringToggle || (((next && enabled) || (!next && collapsed)) && inSidebar))
      )
        focusRequest.current = "toggle";
      setNarrow(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, collapsed]);
  useLayoutEffect(() => {
    if (!automatic) setOpened(false);
  }, [automatic]);
  // 导航变更可能不改变visible；每次提交仅消费这次明确的请求，不能留到下一次缩窗。
  useLayoutEffect(() => {
    const request = focusRequest.current;
    focusRequest.current = null;
    if (request === null) return;
    const selector =
      request === "toggle"
        ? "[data-sidebar-toggle]"
        : '[data-library-sidebar] [aria-current="page"]';
    root.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  const close = useCallback(
    (leavingTemporaryPage = false) => {
      if (!overlay && !leavingTemporaryPage) return;
      focusRequest.current = "toggle";
      setOpened(false);
    },
    [overlay],
  );
  const toggle = useCallback(() => {
    if (!automatic) {
      if (visible) focusRequest.current = "toggle";
      else focusRequest.current = "navigation";
      toggleSaved();
      return;
    }
    focusRequest.current = opened ? "toggle" : "navigation";
    setOpened(!opened);
  }, [automatic, opened, visible, toggleSaved]);
  useSidebarEscape(overlay, close);
  return { root, automatic, overlay, visible, toggle, close };
}

function useSidebarEscape(overlay: boolean, close: () => void) {
  useLayoutEffect(() => {
    if (!overlay) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [overlay, close]);
}
