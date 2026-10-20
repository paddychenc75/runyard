import { numbers } from "@runyard/tokens";
import { useLayoutEffect, useRef } from "react";

function revealFileTab(view: HTMLDivElement, item: HTMLElement | null): void {
  if (!item || view.clientWidth <= 0) return;
  const bounds = view.getBoundingClientRect();
  const tab = item.getBoundingClientRect();
  const delta =
    tab.left < bounds.left
      ? tab.left - bounds.left
      : tab.right > bounds.right
        ? tab.right - bounds.right
        : 0;
  view.scrollLeft = Math.max(
    0,
    Math.min(view.scrollWidth - view.clientWidth, view.scrollLeft + delta),
  );
}

function listenForFileTabInput(view: HTMLDivElement): () => void {
  let focusFrame: number | undefined;
  const cancelFocus = () => {
    if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
    focusFrame = undefined;
  };
  const focus = (event: FocusEvent) => {
    const item =
      event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>("[data-file-tab]")
        : null;
    if (!item) return;
    cancelFocus();
    // 键盘焦点的原生滚入只照顾按钮本身；下一帧补全同一标签里的关闭钮，不滚祖先。
    focusFrame = requestAnimationFrame(() => {
      focusFrame = undefined;
      if (item.isConnected && item.contains(document.activeElement)) revealFileTab(view, item);
    });
  };
  const wheel = (event: WheelEvent) => {
    cancelFocus();
    // 原生deltaX和Ctrl/Meta缩放保持原行为。
    if (event.ctrlKey || event.metaKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    const max = view.scrollWidth - view.clientWidth;
    if (max <= 0) return;
    const unit =
      event.deltaMode === 2
        ? view.clientWidth
        : event.deltaMode === 1
          ? numbers["text-body-line-height"]
          : 1;
    event.preventDefault();
    view.scrollLeft = Math.max(0, Math.min(max, view.scrollLeft + event.deltaY * unit));
  };
  // React的wheel监听可能是passive；到边界也取消原生纵向滚动，避免正文/页面跟随。
  view.addEventListener("wheel", wheel, { passive: false });
  view.addEventListener("focusin", focus);
  return () => {
    cancelFocus();
    view.removeEventListener("wheel", wheel);
    view.removeEventListener("focusin", focus);
  };
}

/** 激活/初次恢复/真实宽度变化才定位；普通重绘、同宽RO和手动scroll不定位。 */
export function useFileTabScroll(active: string | null) {
  const viewport = useRef<HTMLDivElement>(null);
  const measuredWidth = useRef(0);
  useLayoutEffect(() => {
    const view = viewport.current;
    if (!view) return;
    const reveal = (selectionChanged: boolean) => {
      const width = view.clientWidth;
      if (width <= 0) return;
      const widthChanged = width !== measuredWidth.current;
      measuredWidth.current = width;
      if (!selectionChanged && !widthChanged) return;
      view.style.setProperty("--file-tab-max-width", `${width}px`);
      revealFileTab(view, view.querySelector<HTMLElement>("[data-selected]"));
    };
    reveal(true);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => reveal(false));
    observer.observe(view);
    return () => observer.disconnect();
  }, [active]);
  useLayoutEffect(() => {
    const view = viewport.current;
    if (view) return listenForFileTabInput(view);
  }, []);
  return viewport;
}
