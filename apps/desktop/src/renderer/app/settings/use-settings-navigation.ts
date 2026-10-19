import { useCallback, useEffect, useRef, useState } from "react";

export const SECTIONS = ["general", "editRun", "deps", "runtime", "cli"] as const;
type Section = (typeof SECTIONS)[number];

export function useSettingsNavigation() {
  const column = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const requested = useRef<{ section: Section; top: number } | null>(null);
  const [current, setCurrent] = useState<Section>("general");
  const [scrolled, setScrolled] = useState(false);
  const updateSection = useCallback(() => {
    const node = viewport.current;
    if (!node) return;
    setScrolled(node.scrollTop > 0);
    if (node.scrollTop === 0) {
      setCurrent("general");
      return;
    }
    // 末组不足一屏时跳转会被浏览器限在底部；保留用户点的目标，手动滚动后再按位置判断。
    if (requested.current && Math.abs(requested.current.top - node.scrollTop) <= 1) {
      setCurrent(requested.current.section);
      return;
    }
    requested.current = null;
    const top = node.getBoundingClientRect().top;
    let active: Section = "general";
    for (const section of SECTIONS) {
      const element = node.querySelector(`[data-settings-section="${section}"]`);
      if (element && element.getBoundingClientRect().top <= top + 1) active = section;
    }
    setCurrent(active);
  }, []);
  const jump = useCallback(
    (section: Section) => {
      const node = viewport.current;
      const element = node?.querySelector(`[data-settings-section="${section}"]`);
      if (!node || !element) return;
      node.scrollTop += element.getBoundingClientRect().top - node.getBoundingClientRect().top;
      requested.current = { section, top: node.scrollTop };
      updateSection();
    },
    [updateSection],
  );

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (requested.current) jump(requested.current.section);
      else updateSection();
    });
    if (column.current) observer.observe(column.current);
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [jump, updateSection]);
  const reveal = (button: HTMLButtonElement) => {
    const node = navigation.current;
    if (!node) return;
    const clip = node.getBoundingClientRect();
    const bounds = button.getBoundingClientRect();
    const inset = Number.parseFloat(getComputedStyle(node).paddingInlineStart);
    // scrollLeft 在不同设备缩放下会舍入，向外取整保住焦点环，不滚动页面的其他祖先。
    if (bounds.right + inset > clip.right)
      node.scrollLeft += Math.ceil(bounds.right + inset - clip.right);
    else if (bounds.left - inset < clip.left)
      node.scrollLeft -= Math.ceil(clip.left - bounds.left + inset);
  };
  return { viewport, column, navigation, current, scrolled, updateSection, jump, reveal };
}
