import { useEffect, useLayoutEffect, useState } from "react";

/** 窗口宽度（CSS 像素），随窗口缩放更新；顶栏按它决定“N 个运行中”和运行条要不要收紧 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return width;
}

/**
 * 元素自己的宽度，随它变化更新。还没量到（首帧、没有布局的测试环境）是 0，调用方把 0 当作“宽”处理：
 * 先画完整的样子，量到之后同步收紧，用户看不到中间那一帧。
 * 返回的是回调引用：元素可能晚一点才出现（页面数据还没到时不画），出现时才开始量。
 */
export function useElementWidth<T extends HTMLElement>(): [(element: T | null) => void, number] {
  const [element, setElement] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (element === null) return;
    setWidth(element.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}
