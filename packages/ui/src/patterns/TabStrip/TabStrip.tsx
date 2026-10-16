import type { Localized } from "@runyard/i18n";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { GlassSurface } from "../../primitives/GlassSurface/index.ts";
import { Icon } from "../../primitives/Icon/index.ts";
import { IconButton } from "../../primitives/IconButton/index.ts";
import { Tooltip } from "../../primitives/Tooltip/index.ts";
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
}

// 标签条：玻璃胶囊里一排标签。键盘遵循 W3C 的 Tabs 规范（手动激活）：
// 方向键、Home、End 只移动焦点，Enter 或空格才切换，免得“切过去就启动”的标签被方向键逐个拉起。
export function TabStrip({
  label,
  items,
  value,
  onValueChange,
  onClose,
  modKey = "meta",
  className,
  ...rest
}: TabStripProps) {
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const current = items.find((item) => item.id === value);

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

  const move = (from: number, to: number) => {
    const target = items[(to + items.length) % items.length];
    if (target !== undefined && from !== to) tabRefs.current.get(target.id)?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const key = event.key;
    if (key === "ArrowRight") move(index, index + 1);
    else if (key === "ArrowLeft") move(index, index - 1);
    else if (key === "Home") move(index, 0);
    else if (key === "End") move(index, items.length - 1);
    else if (key === "Delete") {
      const item = items[index];
      if (item?.closeLabel === undefined) return;
      onClose?.(item.id);
    } else return;
    event.preventDefault();
  };

  return (
    <GlassSurface
      {...rest}
      material="toolbar"
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <div
            key={item.id}
            role="presentation"
            className={styles.tab}
            data-selected={selected ? "" : undefined}
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
              data-closable={item.closeLabel === undefined ? undefined : ""}
              onClick={() => onValueChange?.(item.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {item.icon === undefined ? null : <Icon name={item.icon} size={14} />}
              {item.status === undefined ? null : item.statusLabel === undefined ? (
                <span aria-hidden="true" className={styles.status} data-status={item.status} />
              ) : (
                <span
                  role="img"
                  aria-label={item.statusLabel}
                  className={styles.status}
                  data-status={item.status}
                />
              )}
              <span className={styles.label}>{item.label}</span>
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
    </GlassSurface>
  );
}
