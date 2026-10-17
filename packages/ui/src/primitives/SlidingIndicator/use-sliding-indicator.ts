import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef } from "react";

export interface SlidingIndicatorOptions {
  /** 选中格的选择器；默认带 data-selected 的那一格 */
  selector?: string;
  /** 换选中项时先把它滚进容器的可见范围再滑（横向滚动的标签条用） */
  scrollIntoView?: boolean;
}

export interface SlidingIndicator<C extends HTMLElement> {
  /** 放在“每一格的父元素”上；它必须是定位元素（position: relative），格子是它的直接或间接子元素 */
  container: RefObject<C | null>;
  /** 交给 <SlidingIndicator indicatorRef=…> */
  indicator: RefObject<HTMLSpanElement | null>;
}

// 滑动的选中背景（视觉规范第 6 节，#312）：一组只有一块背景，叠在格子下面。
// 选中项变了才滑：量出新格子的位置和大小，写成 CSS 变量，由样式用 transform 平移、改宽高
// （绝对定位，不影响别的元素的版面）。第一次画出来、增删标签、窗口尺寸变了、字体加载后宽度变了，
// 都是直接贴到新位置（data-animate 不设，transition 不生效）。
export function useSlidingIndicator<C extends HTMLElement = HTMLDivElement>(
  selectedKey: string | null,
  { selector = "[data-selected]", scrollIntoView = false }: SlidingIndicatorOptions = {},
): SlidingIndicator<C> {
  const container = useRef<C>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const shownKey = useRef<string | null | undefined>(undefined);
  const flip = useRef(false);

  const place = useCallback(
    (animate: boolean) => {
      const root = container.current;
      const bar = indicator.current;
      if (root === null || bar === null) return;
      const selected = root.querySelector<HTMLElement>(selector);
      if (selected === null) {
        bar.removeAttribute("data-ready");
        return;
      }
      if (animate && scrollIntoView && typeof selected.scrollIntoView === "function") {
        selected.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      if (animate) {
        // 减弱动态效果下样式用交叉淡入淡出：两个动画名交替，连续换选中项时也能重新开始
        flip.current = !flip.current;
        bar.setAttribute("data-animate", flip.current ? "a" : "b");
      } else {
        bar.removeAttribute("data-animate");
      }
      bar.style.setProperty("--slide-x", `${selected.offsetLeft}px`);
      bar.style.setProperty("--slide-y", `${selected.offsetTop}px`);
      bar.style.setProperty("--slide-w", `${selected.offsetWidth}px`);
      bar.style.setProperty("--slide-h", `${selected.offsetHeight}px`);
      bar.setAttribute("data-ready", "");
    },
    [selector, scrollIntoView],
  );

  // 每次渲染后都量一次：选中项变了就滑，其余原因（增删、改名、宽度变了）直接贴过去
  useLayoutEffect(() => {
    const changed = shownKey.current !== undefined && shownKey.current !== selectedKey;
    shownKey.current = selectedKey;
    place(changed);
  });

  // 容器大小变了（窗口、字体加载）：直接贴
  useEffect(() => {
    const root = container.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(root);
    return () => observer.disconnect();
  }, [place]);

  return { container, indicator };
}
