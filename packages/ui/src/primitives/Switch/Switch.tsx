import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { Localized } from "@runyard/i18n";
import styles from "./Switch.module.css";

export interface SwitchProps {
  /** 开关的名字，读屏器靠它（旁边通常已有可见的文字，所以用 aria 名字而不是再画一遍） */
  label: Localized;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  /** 样例里强制显示聚焦环 */
  "data-force-state"?: "focus";
}

// 开关（设计稿 CreateDialog）：42 × 26 的轨道，22 的白色圆钮；关是灰、开是绿。
export function Switch({
  label,
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  className,
  ...rest
}: SwitchProps) {
  return (
    <BaseSwitch.Root
      aria-label={label}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange?.(next)}
      data-force-state={rest["data-force-state"]}
    >
      <BaseSwitch.Thumb className={styles.thumb} />
    </BaseSwitch.Root>
  );
}
