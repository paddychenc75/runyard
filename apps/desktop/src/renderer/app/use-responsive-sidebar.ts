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
  const returnFocus = useRef(false);
  const automatic = enabled && narrow;
  const overlay = automatic && opened;
  const visible = automatic ? opened : !collapsed;
  const focusToggle = useCallback(
    () => root.current?.querySelector<HTMLElement>("[data-sidebar-toggle]")?.focus(),
    [],
  );
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      const next = width > 0 && width < MIN_WITH_SIDEBAR;
      if (
        ((next && enabled) || (!next && collapsed)) &&
        node.querySelector("[data-library-sidebar]")?.contains(document.activeElement)
      )
        returnFocus.current = true;
      setNarrow(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, collapsed]);
  useLayoutEffect(() => {
    if (!automatic) setOpened(false);
    if (returnFocus.current) {
      returnFocus.current = false;
      focusToggle();
    } else if (overlay) {
      root.current
        ?.querySelector<HTMLElement>('[data-library-sidebar] [aria-current="page"]')
        ?.focus();
    }
  }, [automatic, overlay, visible, focusToggle]);
  const close = useCallback(() => {
    if (!overlay) return;
    returnFocus.current = true;
    setOpened(false);
  }, [overlay]);
  const toggle = useCallback(() => {
    if (!automatic) {
      if (visible) returnFocus.current = true;
      toggleSaved();
      return;
    }
    if (opened) returnFocus.current = true;
    setOpened(!opened);
  }, [automatic, opened, visible, toggleSaved]);
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
  return { root, automatic, overlay, visible, toggle, close };
}
