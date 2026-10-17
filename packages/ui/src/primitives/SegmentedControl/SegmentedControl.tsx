import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { Localized } from "@runyard/i18n";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlItem {
  value: string;
  label: Localized;
}

export interface SegmentedControlProps {
  /** 整组的名字，读屏器靠它 */
  label: Localized;
  items: readonly SegmentedControlItem[];
  /** 当前选中的那一项；必有一项选中 */
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

// 分段选择（设计稿 CreateDialogOn 的 7 天 / 30 天 / 90 天 / 自定义）：灰色轨道里一块“浮起”的选中段。
// 每段是一个带 aria-pressed 的按钮；再点已选中的那段不会取消选择。
export function SegmentedControl({
  label,
  items,
  value,
  onValueChange,
  className,
}: SegmentedControlProps) {
  return (
    <ToggleGroup
      aria-label={label}
      value={[value]}
      onValueChange={(next) => {
        const picked = next[0];
        if (picked !== undefined) onValueChange(picked);
      }}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      {items.map((item) => (
        <Toggle key={item.value} value={item.value} className={styles.segment}>
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
