import type { Localized } from "@runyard/i18n";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { Icon } from "../../primitives/Icon/index.ts";
import { IconButton } from "../../primitives/IconButton/index.ts";
import { Menu } from "../../primitives/Menu/index.ts";
import { SlidingIndicator, useSlidingIndicator } from "../../primitives/SlidingIndicator/index.ts";
import { StatusMark } from "../../primitives/StatusMark/index.ts";
import { Tooltip } from "../../primitives/Tooltip/index.ts";
import { fitTabs } from "./fit-tabs.ts";
import styles from "./TabStrip.module.css";

export type TabStatus = "running" | "starting" | "stopped" | "crashed";

export interface TabStripItem {
  id: string;
  /** 标签上的名字。界面自己的文字是 Localized；用户的内容（如项目名）用 <UserText> 包起来 */
  label: ReactNode;
  /** 名字前的图标；和 status 二选一，都不传就只有名字 */
  icon?: IconName;
  /** 名字前的状态小圆点 */
  status?: TabStatus;
  /** 状态小圆点的文字说明（读屏器读）；不传圆点就只是装饰 */
  statusLabel?: Localized;
  /**
   * 关闭按钮的名字。不传 = 这个标签不能关闭：没有关闭按钮，⌘W 和 Delete 键都不起作用
   * （固定在第一位的资源库标签就是这样，规格 desktop/workspace 的“资源库标签不能关闭”）。
   */
  closeLabel?: Localized;
  /** 放不下时先缩成只剩图标（读屏器和悬停提示仍读 menuLabel）；资源库标签用 */
  shrinkToIcon?: boolean;
  /** 折进“+N”菜单后的名字，也是缩成图标后的悬停提示；label 不是纯文字时必须给 */
  menuLabel?: Localized;
}

export interface TabStripProps extends Omit<ComponentProps<"div">, "aria-label" | "onSelect"> {
  /** 标签条的名字，读屏器靠它 */
  label: Localized;
  items: readonly TabStripItem[];
  /** 当前标签的 id */
  value: string;
  onValueChange?: (id: string) => void;
  /** 点关闭按钮、在标签上按 Delete、或按关闭标签的快捷键时调用；只对能关闭的标签 */
  onClose?: (id: string) => void;
  /** 关闭快捷键用 ⌘ 还是 Ctrl，来自主进程算好的启动信息；默认 meta */
  modKey?: "meta" | "ctrl";
  /** 标签条末尾的“＋”新建按钮（设计稿 Web）；不传就没有 */
  add?: { label: Localized; onClick: () => void };
  /** “+N”菜单的名字（读屏器用）。不传就不折叠：放不下时标签挤在一起，由调用方保证够宽 */
  overflowLabel?: Localized;
}

/** “+N”按钮量不到时的估计宽度，加上右端渐隐占的位置 */
const MORE_FALLBACK_PX = 64;
/** 量不到 --size-tab-min 时（没有样式的测试环境）的最窄宽度，同设计变量的值 */
const TAB_MIN_FALLBACK_PX = 112;
const FADE_PX = 16;

// 标签条：标签直接放在窗口背景上，没有外壳，选中的标签只有一块浅底色（滑动的那块）。
// 键盘遵循 W3C 的 Tabs 规范（手动激活）：方向键、Home、End 只移动焦点，Enter 或空格才切换，
// 免得“切过去就启动”的标签被方向键逐个拉起。
// 放不下时（fit-tabs.ts）：先把 shrinkToIcon 的标签缩成图标，再把后面的折进末尾的“+N”菜单，
// 选中的始终留在条上。折掉的标签仍在 DOM 里（绝对定位、不可见、不可交互）：宽度要靠它们量，
// 窗口变宽时才知道哪些放得回来。
export function TabStrip({
  label,
  items,
  value,
  onValueChange,
  onClose,
  modKey = "meta",
  add,
  overflowLabel,
  className,
  ...rest
}: TabStripProps) {
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const rootRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const fullWidths = useRef(new Map<string, number>());
  const current = items.find((item) => item.id === value);
  const slide = useSlidingIndicator<HTMLDivElement>(current?.id ?? null);
  const [fit, setFit] = useState<{
    iconOnly: readonly boolean[];
    visible: readonly boolean[];
    shrunk: boolean;
  }>({ iconOnly: [], visible: [], shrunk: false });
  // 状态里的数组按位置对应标签；标签增删后长度对不上，就当作都显示，等量完再放进状态
  const aligned = fit.visible.length === items.length;
  const visibleAt = (index: number) => (aligned ? fit.visible[index] !== false : true);
  const iconOnlyAt = (index: number) => (aligned ? fit.iconOnly[index] === true : false);

  // 量宽度、决定谁折进菜单：每次渲染后和容器变宽变窄时都算一次，结果没变就不改状态
  const measure = () => {
    const root = rootRef.current;
    const row = slide.container.current;
    if (root === null || row === null || overflowLabel === undefined) return;
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    const nodes = Array.from(row.querySelectorAll<HTMLElement>("[data-tab-id]"));
    const tabMin =
      Number.parseFloat(getComputedStyle(row).getPropertyValue("--size-tab-min")) ||
      TAB_MIN_FALLBACK_PX;
    const widths = items.map((item, index) => {
      const node = nodes.find((candidate) => candidate.dataset.tabId === item.id);
      if (node !== undefined && !iconOnlyAt(index)) {
        // 名字被省略时，完整宽度要加上被截掉的那一段
        const label = node.querySelector<HTMLElement>("[data-truncate]");
        const cap =
          label === null
            ? 0
            : Number.parseFloat(getComputedStyle(label).maxWidth) || Number.POSITIVE_INFINITY;
        const cut =
          label === null ? 0 : Math.max(0, Math.min(label.scrollWidth, cap) - label.clientWidth);
        fullWidths.current.set(item.id, node.offsetWidth + cut);
      }
      return (fullWidths.current.get(item.id) ?? node?.offsetWidth ?? 0) + gap;
    });
    // 能关闭的项目标签可以压到 tabMin；资源库这类不能关闭的不压
    const minWidths = items.map((item, index) =>
      item.closeLabel === undefined
        ? (widths[index] ?? 0)
        : Math.min(widths[index] ?? 0, tabMin + gap),
    );
    const tabHeight = nodes[0]?.offsetHeight ?? 0;
    const addWidth = addRef.current?.offsetWidth ?? 0;
    const moreWidth = (moreRef.current?.offsetWidth ?? MORE_FALLBACK_PX) + gap + FADE_PX;
    const result = fitTabs({
      widths,
      minWidths,
      available: root.clientWidth - addWidth,
      selected: items.findIndex((item) => item.id === value),
      shrinkable: items.map((item) => item.shrinkToIcon === true),
      iconWidth: tabHeight + gap,
      moreWidth,
    });
    const same =
      result.shrunk === fit.shrunk &&
      result.visible.length === fit.visible.length &&
      result.visible.every((flag, index) => flag === fit.visible[index]) &&
      result.iconOnly.every((flag, index) => flag === fit.iconOnly[index]);
    if (!same) setFit(result);
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  });

  // 关闭快捷键在整个窗口里生效，不要求焦点在标签条上；当前标签不能关闭时吞掉按键，什么都不发生
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const pressed = modKey === "meta" ? event.metaKey : event.ctrlKey;
      if (!pressed || event.altKey || event.shiftKey || event.key.toLowerCase() !== "w") return;
      event.preventDefault();
      if (current?.closeLabel !== undefined) onClose?.(current.id);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modKey, current, onClose]);

  // 方向键只在看得见的标签之间走
  const shown = items.flatMap((item, index) => (visibleAt(index) ? [index] : []));
  const move = (from: number, step: number) => {
    const at = shown.indexOf(from);
    const target = items[shown[(at + step + shown.length) % shown.length] ?? from];
    if (target !== undefined && target !== items[from]) tabRefs.current.get(target.id)?.focus();
  };
  const moveTo = (position: number) => {
    const target = items[shown[position] ?? -1];
    if (target !== undefined) tabRefs.current.get(target.id)?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = event.key;
    if (key === "ArrowRight") move(index, 1);
    else if (key === "ArrowLeft") move(index, -1);
    else if (key === "Home") moveTo(0);
    else if (key === "End") moveTo(shown.length - 1);
    else if (key === "Delete") {
      const item = items[index];
      if (item?.closeLabel === undefined) return;
      onClose?.(item.id);
    } else return;
    event.preventDefault();
  };

  const hidden = items.flatMap((item, index) => (visibleAt(index) ? [] : [item]));
  const nameOf = (item: TabStripItem): Localized =>
    item.menuLabel ??
    (typeof item.label === "string" ? (item.label as Localized) : (item.id as Localized));

  return (
    <div
      {...rest}
      ref={rootRef}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      <div
        ref={slide.container}
        role="tablist"
        aria-label={label}
        aria-orientation="horizontal"
        className={styles.row}
        data-overflow={hidden.length > 0 ? "" : undefined}
        data-shrunk={aligned && fit.shrunk ? "" : undefined}
      >
        <SlidingIndicator indicatorRef={slide.indicator} className={styles.indicator} />
        {items.map((item, index) => {
          const selected = item.id === value;
          const folded = !visibleAt(index);
          const iconOnly = iconOnlyAt(index);
          return (
            <div
              key={item.id}
              role="presentation"
              data-tab-id={item.id}
              className={styles.tab}
              data-selected={selected ? "" : undefined}
              data-folded={folded ? "" : undefined}
              data-icon-only={iconOnly ? "" : undefined}
              inert={folded || undefined}
            >
              <button
                type="button"
                role="tab"
                id={`${baseId}-${item.id}`}
                ref={(node) => {
                  if (node === null) tabRefs.current.delete(item.id);
                  else tabRefs.current.set(item.id, node);
                }}
                className={styles.trigger}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                title={iconOnly ? nameOf(item) : undefined}
                data-closable={item.closeLabel === undefined ? undefined : ""}
                onClick={() => onValueChange?.(item.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {item.icon === undefined ? null : <Icon name={item.icon} size={14} />}
                {item.status === undefined ? null : (
                  <StatusMark status={item.status} markLabel={item.statusLabel} />
                )}
                <span className={styles.label} data-truncate="">
                  {item.label}
                </span>
              </button>
              {item.closeLabel === undefined ? null : (
                // 鼠标用的关闭钮不进 Tab 顺序：键盘用户在标签上按 Delete 关闭
                <Tooltip content={item.closeLabel}>
                  <IconButton
                    icon="close"
                    size="xs"
                    label={item.closeLabel}
                    tabIndex={-1}
                    className={styles.close}
                    onClick={() => onClose?.(item.id)}
                  />
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
      {hidden.length === 0 || overflowLabel === undefined ? null : (
        <Menu
          label={overflowLabel}
          align="start"
          trigger={
            <button ref={moreRef} type="button" className={styles.more} aria-label={overflowLabel}>
              <span>+{hidden.length}</span>
              <Icon name="chevron-down" size={12} />
            </button>
          }
          entries={hidden.map((item) => ({ id: item.id, label: nameOf(item) }))}
          onSelect={(id) => onValueChange?.(id)}
        />
      )}
      {add === undefined ? null : (
        <span ref={addRef} className={styles.addWrap}>
          <Tooltip content={add.label}>
            <IconButton
              icon="plus"
              size="sm"
              label={add.label}
              className={styles.add}
              onClick={add.onClick}
            />
          </Tooltip>
        </span>
      )}
    </div>
  );
}
