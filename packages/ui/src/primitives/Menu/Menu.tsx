import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { Localized } from "@runyard/i18n";
import type { ReactElement } from "react";
import { GlassSurface } from "../GlassSurface/index.ts";
import { Icon } from "../Icon/index.ts";
import { ScrollArea } from "../ScrollArea/index.ts";
import styles from "./Menu.module.css";

export interface MenuItemEntry {
  id: string;
  label: Localized;
  /** 右侧的小字提示（如“回车”），不是第二个操作 */
  hint?: Localized;
  /** danger 用红色字，给“移到废纸篓”这类不可轻易撤销的项 */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** 单选菜单（如筛选下拉）里标出当前值：前面画对勾，读屏器读成“选中”；不传就是普通菜单项 */
  checked?: boolean;
}

/** 带小标题的一组：标题给读屏器当这一组的名字（如“Claude Code · 已安装”下面的“重新安装”） */
export interface MenuGroupEntry {
  type: "group";
  label: Localized;
  items: readonly MenuItemEntry[];
}

export type MenuEntry =
  | ({ type?: "item" } & MenuItemEntry)
  | { type: "separator" }
  | MenuGroupEntry;

export interface MenuProps {
  /** 菜单的名字，读屏器靠它（如“react-counter 的更多操作”） */
  label: Localized;
  /** 打开菜单的元素，必须是单个能接收引用的元素（如 <IconButton>） */
  trigger: ReactElement;
  entries: readonly MenuEntry[];
  /** 选中某一项；参数是那一项的 id。菜单随后自己关闭 */
  onSelect: (id: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  /** 开合变化；外壳要靠它在菜单打开时让原生预览让位（技术设计 §6.1） */
  onOpenChange?: (open: boolean) => void;
  /** 菜单与触发元素哪一边对齐；缺省是右边（更多按钮）。右键菜单把一个零大小的元素放在鼠标处，用 start 让菜单向右下展开 */
  align?: "start" | "end";
  /** 追加到菜单面板上的类名：只许调宽度（如右键菜单比“更多”菜单宽） */
  className?: string;
}

const SIDE_OFFSET = 6;
// 离窗口边至少留这么多，翻转和平移（碰撞避让）按它算
const COLLISION_PADDING = 8;

export function Menu({
  label,
  trigger,
  entries,
  onSelect,
  open,
  defaultOpen,
  onOpenChange,
  align = "end",
  className,
}: MenuProps) {
  return (
    <BaseMenu.Root
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={(next) => onOpenChange?.(next)}
    >
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner
          side="bottom"
          align={align}
          sideOffset={SIDE_OFFSET}
          collisionPadding={COLLISION_PADDING}
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
          className={styles.positioner}
        >
          <BaseMenu.Popup
            render={<GlassSurface material="menu" />}
            className={className === undefined ? styles.popup : `${styles.popup} ${className}`}
            aria-label={label}
            aria-labelledby={undefined}
          >
            {/* 上下都放不下时面板的高度被压到可用空间（见 Menu.module.css），超出的在共享 ScrollArea 里滚动 */}
            <ScrollArea className={styles.scroll}>
              {entries.map((entry, index) =>
                entry.type === "separator" ? (
                  <BaseMenu.Separator key={`separator-${index}`} className={styles.separator} />
                ) : entry.type === "group" ? (
                  <BaseMenu.Group key={`group-${index}`}>
                    <BaseMenu.GroupLabel className={styles.groupLabel}>
                      {entry.label}
                    </BaseMenu.GroupLabel>
                    {entry.items.map((item) => (
                      <MenuItem key={item.id} entry={item} onSelect={onSelect} />
                    ))}
                  </BaseMenu.Group>
                ) : (
                  <MenuItem key={entry.id} entry={entry} onSelect={onSelect} />
                ),
              )}
            </ScrollArea>
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

function MenuItem({ entry, onSelect }: { entry: MenuItemEntry; onSelect: (id: string) => void }) {
  return (
    <BaseMenu.Item
      className={styles.item}
      data-tone={entry.tone ?? "default"}
      disabled={entry.disabled}
      {...(entry.checked === undefined
        ? {}
        : { role: "menuitemradio", "aria-checked": entry.checked })}
      onClick={() => onSelect(entry.id)}
    >
      {entry.checked === undefined ? null : (
        <span className={styles.check} aria-hidden="true">
          {entry.checked ? <Icon name="check" size={14} /> : null}
        </span>
      )}
      <span className={styles.label}>{entry.label}</span>
      {entry.hint === undefined ? null : <span className={styles.hint}>{entry.hint}</span>}
    </BaseMenu.Item>
  );
}
