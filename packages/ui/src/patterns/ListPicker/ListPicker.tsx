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
import {
  MonogramTile,
  type TechLogo,
  type TileBrand,
} from "../../primitives/MonogramTile/index.ts";
import { ScrollArea } from "../../primitives/ScrollArea/index.ts";
import { UserText } from "../../primitives/UserText/index.ts";
import styles from "./ListPicker.module.css";

interface ListPickerItemBase {
  id: string;
  /** warning 把第二行画成警示色（如已停止维护） */
  tone?: "default" | "warning";
  /** 前面方块里的字母 */
  letters: string;
  /** 有技术标志时画标志，不画字母 */
  logo?: TechLogo;
  brand?: TileBrand;
}

/** 外部元数据必须显式标记；普通控件文字仍要求经过文案包。 */
export type ListPickerItem = ListPickerItemBase &
  (
    | { userContent: true; title: string; subtitle?: string }
    | { userContent?: false; title: Localized; subtitle?: Localized }
  );

export interface ListPickerGroup {
  id: string;
  title: Localized;
  items: readonly ListPickerItem[];
}

/** 左侧分类栏的一项：只负责跳转和指示位置，不过滤列表 */
export interface ListPickerRailItem {
  id: string;
  label: Localized;
  count: number;
  /** 点它跳到哪个分组的第一行；不给就跳到列表开头。当前行所在的分组就是栏里选中的那一项 */
  groupId?: string;
}

export interface ListPickerRail {
  /** 栏的名字，读屏器靠它 */
  label: Localized;
  items: readonly ListPickerRailItem[];
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
  /** 顶部：一般是搜索框；键盘事件从它冒泡上来，焦点留在它里面 */
  renderHeader: (props: ListPickerSearchProps) => ReactNode;
  /** 左侧分类栏；不给就没有这一栏。栏里的按钮不进 Tab 顺序，点它也不抢走搜索框的焦点 */
  rail?: ListPickerRail;
  /** 底部提示条；给函数时拿到当前高亮行的 id（没有行时为 undefined），内容可以随高亮变 */
  footer?: ReactNode | ((activeId: string | undefined) => ReactNode);
  /** 点击一行或在高亮行上按回车 */
  onChoose: (id: string) => void;
}

// 分组的单选列表（模板选择器的主体）。键盘：上下方向键移动高亮、Home/End 到头尾、回车选择；
// 焦点始终留在顶部的搜索框里（combobox + listbox 的 aria-activedescendant 做法）。
// 同一项可以出现在不同分组（“最近使用”和它的分类），所以高亮按“第几行”记，不按 id。
export function ListPicker({
  label,
  groups,
  renderHeader,
  rail,
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
  // 列表内容变了（如搜索过滤）就回到第一行：第一个结果自动高亮
  const signature = flat.map((entry) => `${entry.group.id}/${entry.item.id}`).join("|");
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setActive(0);
  }
  const optionId = (index: number) => `${baseId}-option-${index}`;
  const listRef = useRef<HTMLDivElement>(null);

  // 键盘把高亮移出可见区时，让它滚进来；鼠标悬停造成的移动不需要，行本来就在眼前
  useEffect(() => {
    const row = listRef.current?.querySelector(`[id="${optionId(current)}"]`);
    if (row instanceof HTMLElement && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  });

  // 分类栏：点一项就把高亮放到那个分组的第一行，并把分组标题滚到列表顶部；没有 groupId 的回到开头。
  // 先滚再改高亮：之后跟随高亮的滚动（block: nearest）发现行已经在眼前，就不会再动
  function jumpTo(groupId: string | undefined) {
    const target =
      groupId === undefined ? 0 : flat.findIndex((entry) => entry.group.id === groupId);
    const entry = flat[target];
    if (entry === undefined) return;
    const title = listRef.current?.querySelector(`[data-group-title="${entry.group.id}"]`);
    if (title instanceof HTMLElement && typeof title.scrollIntoView === "function") {
      title.scrollIntoView({ block: "start" });
    }
    setActive(target);
  }
  const currentGroupId = flat[current]?.group.id;

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

  const footerNode = typeof footer === "function" ? footer(flat[current]?.item.id) : footer;
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
      <div className={styles.body}>
        {rail === undefined ? null : (
          // biome-ignore lint/a11y/useSemanticElements: 这一栏是一组跳转按钮，不是页面导航；用 nav 会和外壳的侧栏导航撞角色
          <div
            role="toolbar"
            aria-orientation="vertical"
            aria-label={rail.label}
            className={styles.rail}
          >
            {rail.items.map((item) => {
              const selected = item.groupId !== undefined && item.groupId === currentGroupId;
              return (
                // tabIndex -1 加 mousedown 不取焦点：键盘永远在搜索框里，点栏不会把焦点带走
                <button
                  key={item.id}
                  type="button"
                  tabIndex={-1}
                  className={styles.railItem}
                  data-selected={selected ? "" : undefined}
                  aria-current={selected ? "true" : undefined}
                  disabled={item.count === 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => jumpTo(item.groupId)}
                >
                  <span className={styles.railLabel}>{item.label}</span>
                  <span className={styles.railCount}>{item.count}</span>
                </button>
              );
            })}
          </div>
        )}
        <ScrollArea className={styles.scroll}>
          <div ref={listRef} id={listId} role="listbox" aria-label={label} className={styles.list}>
            {groups.map((group) => (
              // biome-ignore lint/a11y/useSemanticElements: #172 listbox 里的分组按 ARIA 规范只能是 role=group，fieldset 不适用
              <div key={group.id} role="group" aria-label={group.title} className={styles.group}>
                <div className={styles.groupTitle} aria-hidden="true" data-group-title={group.id}>
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
                      <MonogramTile
                        letters={item.letters}
                        logo={item.logo}
                        brand={item.brand}
                        size="lg"
                      />
                      <span className={styles.text}>
                        <span className={styles.title} data-truncate="">
                          {item.userContent ? <UserText>{item.title}</UserText> : item.title}
                        </span>
                        {item.subtitle === undefined ? null : (
                          <span className={styles.subtitle} data-truncate="">
                            {item.userContent ? (
                              <UserText>{item.subtitle}</UserText>
                            ) : (
                              item.subtitle
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      {footerNode === undefined ? null : <div className={styles.footer}>{footerNode}</div>}
    </div>
  );
}
