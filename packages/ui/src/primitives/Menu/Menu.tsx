import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { Localized } from "@runyard/i18n";
import type { ReactElement } from "react";
import { GlassSurface } from "../GlassSurface/index.ts";
import styles from "./Menu.module.css";

export interface MenuItemEntry {
  id: string;
  label: Localized;
  /** 右侧的小字提示（如“回车”），不是第二个操作 */
  hint?: Localized;
  /** danger 用红色字，给“移到废纸篓”这类不可轻易撤销的项 */
  tone?: "default" | "danger";
  disabled?: boolean;
}

export type MenuEntry = ({ type?: "item" } & MenuItemEntry) | { type: "separator" };

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
}

const SIDE_OFFSET = 6;

export function Menu({
  label,
  trigger,
  entries,
  onSelect,
  open,
  defaultOpen,
  onOpenChange,
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
          align="end"
          sideOffset={SIDE_OFFSET}
          className={styles.positioner}
        >
          <BaseMenu.Popup
            render={<GlassSurface material="menu" />}
            className={styles.popup}
            aria-label={label}
            aria-labelledby={undefined}
          >
            {entries.map((entry, index) =>
              entry.type === "separator" ? (
                <BaseMenu.Separator key={`separator-${index}`} className={styles.separator} />
              ) : (
                <BaseMenu.Item
                  key={entry.id}
                  className={styles.item}
                  data-tone={entry.tone ?? "default"}
                  disabled={entry.disabled}
                  onClick={() => onSelect(entry.id)}
                >
                  <span className={styles.label}>{entry.label}</span>
                  {entry.hint === undefined ? null : (
                    <span className={styles.hint}>{entry.hint}</span>
                  )}
                </BaseMenu.Item>
              ),
            )}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}
