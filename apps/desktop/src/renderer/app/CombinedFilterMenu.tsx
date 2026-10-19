import type { Localized } from "@runyard/i18n";
import { Icon, Menu, type MenuEntry } from "@runyard/ui";
import styles from "./FilterMenu.module.css";

export interface CombinedFilterGroup {
  id: string;
  /** 这一组在菜单里的小标题 */
  title: Localized;
  options: readonly { id: string; label: Localized }[];
  value: string;
  disabled?: boolean;
}

export interface CombinedFilterMenuProps {
  /** 按钮上的文字（“筛选”） */
  buttonLabel: Localized;
  /** 菜单的名字，读屏器靠它 */
  menuLabel: Localized;
  groups: readonly CombinedFilterGroup[];
  /** 选中某一组的某个选项 */
  onValueChange: (group: string, id: string) => void;
}

// 窗口窄时“类型”和“状态”合成的一个“筛选”按钮（规格 DESKTOP-LIBRARY-VIEW-67）：点开后每组选项都在里面，各自单选。
export function CombinedFilterMenu({
  buttonLabel,
  menuLabel,
  groups,
  onValueChange,
}: CombinedFilterMenuProps) {
  const entries: MenuEntry[] = groups.flatMap((group, index): MenuEntry[] => [
    ...(index === 0 ? [] : [{ type: "separator" } as const]),
    { id: `title:${group.id}`, label: group.title, disabled: true },
    ...group.options.map((option) => ({
      id: `${group.id}:${option.id}`,
      label: option.label,
      checked: option.id === group.value,
      disabled: group.disabled,
    })),
  ]);
  return (
    <Menu
      label={menuLabel}
      entries={entries}
      onSelect={(id) => {
        const at = id.indexOf(":");
        onValueChange(id.slice(0, at), id.slice(at + 1));
      }}
      trigger={
        <button type="button" className={styles.root}>
          <span>{buttonLabel}</span>
          <Icon name="chevron-down" size={12} className={styles.caret} />
        </button>
      }
    />
  );
}
