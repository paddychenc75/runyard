import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import { useId } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { Icon } from "../../primitives/Icon/index.ts";
import styles from "./NavList.module.css";

export interface NavListItem {
  id: string;
  label: Localized;
  /** 不传就画一个圆点标记（设计稿里“全部”“运行中”这类筛选项） */
  icon?: IconName;
  /** 右侧的数字，已经过格式化函数 */
  count?: Localized;
  /** 页面还没做好等原因暂时点不了；仍在列表里，读屏器读到“不可用” */
  disabled?: boolean;
}

export interface NavListSection {
  id: string;
  /** 分组小标题；不传就没有标题 */
  title?: Localized;
  items: readonly NavListItem[];
}

export interface NavListProps extends Omit<ComponentProps<"nav">, "aria-label" | "onSelect"> {
  /** 导航区域的名字，读屏器靠它在页面地标里区分 */
  label: Localized;
  sections: readonly NavListSection[];
  /** 当前所在的项；不属于任何项就没有高亮 */
  value?: string;
  /** 宿主窗口失焦时，选中项图标改用次要文字色 */
  active?: boolean;
  onValueChange?: (id: string) => void;
}

// 侧栏里的导航列表。当前项用 aria-current="page" 表达（它是“链接到别处”的列表，不是单选组）。
export function NavList({
  label,
  sections,
  value,
  active = true,
  onValueChange,
  className,
  ...rest
}: NavListProps) {
  const baseId = useId();
  return (
    <nav
      {...rest}
      aria-label={label}
      data-active={active}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      {sections.map((section) => {
        const titleId = `${baseId}-${section.id}`;
        return (
          <section
            key={section.id}
            className={styles.section}
            aria-labelledby={section.title === undefined ? undefined : titleId}
          >
            {section.title === undefined ? null : (
              <h2 id={titleId} className={styles.title}>
                {section.title}
              </h2>
            )}
            <ul className={styles.list}>
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={styles.item}
                    aria-current={item.id === value ? "page" : undefined}
                    disabled={item.disabled}
                    data-selected={item.id === value ? "" : undefined}
                    onClick={() => onValueChange?.(item.id)}
                  >
                    {item.icon === undefined ? (
                      <span aria-hidden="true" className={styles.mark} />
                    ) : (
                      <Icon name={item.icon} size={15} />
                    )}
                    <span className={styles.label} data-truncate="">
                      {item.label}
                    </span>
                    {item.count === undefined ? null : (
                      <span className={styles.count}>{item.count}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
