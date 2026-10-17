import type { Localized } from "@runyard/i18n";
import { Icon, Menu, type MenuEntry } from "@runyard/ui";
import styles from "./FilterMenu.module.css";

export interface FilterMenuOption {
  id: string;
  label: Localized;
}

export interface FilterMenuProps {
  /** 按钮上的文字，已含当前值（“类型：全部”） */
  buttonLabel: Localized;
  /** 菜单的名字，读屏器靠它 */
  menuLabel: Localized;
  options: readonly FilterMenuOption[];
  value: string;
  onValueChange: (id: string) => void;
}

// 资源库页的下拉（设计稿 Main 的“类型：全部”这类胶囊）：按钮上写出当前值，菜单里单选。
export function FilterMenu({
  buttonLabel,
  menuLabel,
  options,
  value,
  onValueChange,
}: FilterMenuProps) {
  const entries: MenuEntry[] = options.map((option) => ({
    id: option.id,
    label: option.label,
    checked: option.id === value,
  }));
  return (
    <Menu
      label={menuLabel}
      entries={entries}
      onSelect={onValueChange}
      trigger={
        <button type="button" className={styles.root}>
          <span>{buttonLabel}</span>
          <Icon name="chevron-down" size={12} className={styles.caret} />
        </button>
      }
    />
  );
}
