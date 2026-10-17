import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { Localized } from "@runyard/i18n";
import { type ReactNode, useId } from "react";
import { Icon } from "../Icon/index.ts";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  /** 勾选项的名字，点它也能勾选 */
  label: Localized | ReactNode;
  /** 名字只给读屏器和点击用，不画出来（名字已经由旁边的内容画了，如文件树的一行）；说明也一并不画 */
  labelHidden?: boolean;
  /** 名字下面的补充说明，会作为描述关联给读屏器 */
  hint?: Localized;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  /** 样例里强制显示聚焦环 */
  "data-force-state"?: "focus";
}

export function Checkbox({
  label,
  labelHidden = false,
  hint,
  checked,
  defaultChecked,
  disabled,
  onCheckedChange,
  className,
  ...rest
}: CheckboxProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const labelId = `${id}-label`;
  return (
    <div className={className === undefined ? styles.root : `${styles.root} ${className}`}>
      <BaseCheckbox.Root
        id={id}
        aria-labelledby={labelId}
        className={styles.box}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onCheckedChange={(next) => onCheckedChange?.(next)}
        aria-describedby={hint === undefined ? undefined : hintId}
        data-force-state={rest["data-force-state"]}
      >
        <BaseCheckbox.Indicator className={styles.indicator}>
          <Icon name="check" size={12} />
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span className={labelHidden ? `${styles.text} ${styles.hidden}` : styles.text}>
        {/* 点文字等于点方框：label 指向 Base UI 的隐藏 input（id 落在它上面） */}
        <label id={labelId} htmlFor={id} className={styles.label}>
          {label}
        </label>
        {hint === undefined ? null : (
          <span id={hintId} className={styles.hint}>
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}
