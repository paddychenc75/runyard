import { useCallback, useLayoutEffect, useRef, useState } from "react";

// 收列后的表格仍需约742px，加侧栏264px与页边距56px；1100可容纳，1024需临时隐藏。
const LIBRARY_MIN_WITH_SIDEBAR = 1062;
// 项目页：侧栏 240 + 文件树 216 + 编辑器至少 420 + 预览至少 280 + 间距，1280 以下放不下，默认收起侧栏（UI 走查 W1）。
const PROJECT_MIN_WITH_SIDEBAR = 1280;

/** 自动隐藏只影响本次布局，持久偏好由调用方在宽窗口手动切换时写入。 */
export function useResponsiveSidebar(
  enabled: boolean,
  collapsed: boolean,
  toggleSaved: () => void,
  projectPage = false,
) {
  const minWidth = projectPage ? PROJECT_MIN_WITH_SIDEBAR : LIBRARY_MIN_WITH_SIDEBAR;
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [opened, setOpened] = useState(false);
  const focusRequest = useRef<"toggle" | "navigation" | null>(null);
  const measuredNarrow = useRef(false);
  const automatic = enabled && narrow;
  // 项目页窄窗口：展开的侧栏是布局里的一栏，把内容向右推（负责人 2026-10-26），只有资源库页才浮在表格上。
  const overlay = automatic && opened && !projectPage;
  const visible = automatic ? opened : !collapsed;
  useLayoutEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = node.getBoundingClientRect().width;
      const next = width > 0 && width < minWidth;
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
  }, [enabled, collapsed, minWidth]);
  useLayoutEffect(() => {
    if (!automatic) setOpened(false);
  }, [automatic]);
  // 打开项目（进入项目页）或离开项目页回资源库时，临时展开的状态都清掉：侧栏从收起开始，
  // 也不会把项目页里推开内容的侧栏带成资源库页上的浮层。
  useLayoutEffect(() => {
    setOpened(false);
  }, [projectPage]);
  // 导航变更可能不改变visible；每次提交仅消费这次明确的请求，不能留到下一次缩窗。
  useLayoutEffect(() => {
    const request = focusRequest.current;
    focusRequest.current = null;
    if (request === null) return;
    const selector =
      request === "toggle"
        ? "[data-sidebar-toggle]"
        : '[data-library-sidebar] [aria-current="page"]';
    const target =
      root.current?.querySelector<HTMLElement>(selector) ??
      (request === "navigation"
        ? root.current?.querySelector<HTMLElement>(
            "[data-library-sidebar] nav button:not(:disabled)",
          )
        : null);
    target?.focus();
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
      else focusRequest.current = pointerOrigin() ? null : "navigation";
      toggleSaved();
      return;
    }
    // 鼠标点开时焦点留在切换按钮上，不把键盘焦点环送进侧栏；键盘或菜单触发才移入导航。
    focusRequest.current = opened ? "toggle" : pointerOrigin() ? null : "navigation";
    setOpened(!opened);
  }, [automatic, opened, visible, toggleSaved]);
  useSidebarEscape(overlay, close);
  return { root, automatic, overlay, visible, toggle, close };
}

// 焦点环只在键盘操作后出现：切换按钮被鼠标点击（click 的 detail 大于 0）的那一次派发期间标记为“鼠标发起”。
// 快捷键和菜单是主进程发来的事件、不会落在这段派发里；键盘回车触发的点击 detail 为 0，同样算键盘。
let pointerClick = false;
if (typeof window !== "undefined") {
  window.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      pointerClick = event.detail > 0 && target?.closest("[data-sidebar-toggle]") != null;
    },
    true,
  );
  // 冒泡到 window 时 React 的处理已经跑完，清掉标记
  window.addEventListener("click", () => {
    pointerClick = false;
  });
}

/** 这一次切换是不是鼠标点切换按钮发起的。 */
function pointerOrigin(): boolean {
  return pointerClick;
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
