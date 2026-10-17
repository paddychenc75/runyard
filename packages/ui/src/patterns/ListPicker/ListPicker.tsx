import type { Localized } from "@runyard/i18n";
import {
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { MonogramTile } from "../../primitives/MonogramTile/index.ts";
import styles from "./ListPicker.module.css";

export interface ListPickerItem {
  id: string;
  title: Localized | string;
  /** 第二行；不传就只有一行 */
  subtitle?: Localized | string;
  /** warning 把第二行画成警示色（如已停止维护） */
  tone?: "default" | "warning";
  /** 前面方块里的字母 */
  letters: string;
}

export interface ListPickerGroup {
  id: string;
  title: Localized;
  items: readonly ListPickerItem[];
}

/** 交给搜索框的属性：键盘移动高亮时，读屏器靠它们知道“当前选中哪一行” */
export interface ListPickerSearchProps {
  role: "combobox";
  "aria-expanded": true;
  "aria-controls": string;
  "aria-activedescendant": string | undefined;
}

export interface ListPickerProps
  extends Omit<ComponentProps<"div">, "aria-label" | "onSelect" | "children"> {
  /** 列表的名字，读屏器靠它 */
  label: Localized;
  groups: readonly ListPickerGroup[];
  /** 当前高亮行右边的按钮文字 */
  chooseLabel: Localized;
  /** 顶部：一般是搜索框；键盘事件从它冒泡上来，焦点留在它里面 */
  renderHeader: (props: ListPickerSearchProps) => ReactNode;
  /** 底部提示条 */
  footer?: ReactNode;
  /** 点击一行、点“选择”或在高亮行上按回车 */
  onChoose: (id: string) => void;
}

// 分组的单选列表（模板选择器的主体）。键盘：上下方向键移动高亮、Home/End 到头尾、回车选择；
// 焦点始终留在顶部的搜索框里（combobox + listbox 的 aria-activedescendant 做法）。
// 同一项可以出现在不同分组（“最近使用”和它的分类），所以高亮按“第几行”记，不按 id。
export function ListPicker({
  label,
  groups,
  chooseLabel,
  renderHeader,
  footer,
  onChoose,
  className,
  ...rest
}: ListPickerProps) {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const flat = groups.flatMap((group) => group.items.map((item) => ({ group, item })));
  const count = flat.length;
  const current = Math.min(active, Math.max(count - 1, 0));
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const listRef = useRef<HTMLDivElement>(null);

  // 键盘把高亮移出可见区时，让它滚进来；鼠标悬停造成的移动不需要，行本来就在眼前
  useEffect(() => {
    const row = listRef.current?.querySelector(`[id="${optionId(current)}"]`);
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  });

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // 输入法正在组词时，方向键和回车属于输入法
    if (event.nativeEvent.isComposing || count === 0) return;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(current + 1, count - 1),
      ArrowUp: Math.max(current - 1, 0),
      Home: 0,
      End: count - 1,
    };
    const next = moves[event.key];
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    } else if (event.key === "Enter") {
      const entry = flat[current];
      if (entry === undefined) return;
      event.preventDefault();
      onChoose(entry.item.id);
    }
  }

  const listId = `${baseId}-list`;
  let index = -1;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: #172 键盘事件从搜索框冒泡到这里统一处理，根节点本身不是控件
    <div
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      onKeyDown={onKeyDown}
    >
      {renderHeader({
        role: "combobox",
        "aria-expanded": true,
        "aria-controls": listId,
        "aria-activedescendant": count === 0 ? undefined : optionId(current),
      })}
      <div className={styles.scroll}>
        <div ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
          {groups.map((group) => (
            // biome-ignore lint/a11y/useSemanticElements: #172 listbox 里的分组按 ARIA 规范只能是 role=group，fieldset 不适用
            <div key={group.id} role="group" aria-label={group.title} className={styles.group}>
              <div className={styles.groupTitle} aria-hidden="true">
                {group.title}
              </div>
              {group.items.map((item) => {
                index += 1;
                const rowIndex = index;
                const highlighted = rowIndex === current;
                return (
                  // biome-ignore lint/a11y/useFocusableInteractive: #172 选项不可聚焦，焦点留在搜索框，靠 aria-activedescendant 指向它
                  // biome-ignore lint/a11y/useKeyWithClickEvents: #172 键盘由根节点上的 onKeyDown 统一处理（焦点留在搜索框里）
                  <div
                    key={item.id}
                    id={optionId(rowIndex)}
                    role="option"
                    aria-selected={highlighted}
                    className={styles.row}
                    data-active={highlighted ? "" : undefined}
                    data-tone={item.tone ?? "default"}
                    onMouseMove={() => {
                      if (!highlighted) setActive(rowIndex);
                    }}
                    onClick={() => onChoose(item.id)}
                  >
                    <MonogramTile letters={item.letters} size="lg" />
                    <span className={styles.text}>
                      <span className={styles.title} data-truncate="">
                        {item.title}
                      </span>
                      {item.subtitle === undefined ? null : (
                        <span className={styles.subtitle} data-truncate="">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                    {highlighted ? (
                      <span className={styles.choose} aria-hidden="true">
                        {chooseLabel}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {footer === undefined ? null : <div className={styles.footer}>{footer}</div>}
    </div>
  );
}
