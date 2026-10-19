import { Field as BaseField } from "@base-ui/react/field";
import type { Localized } from "@runyard/i18n";
import type { ReactNode } from "react";
import styles from "./Field.module.css";

export interface FieldProps {
  /** 字段的名字（粗体），点它聚焦里面的控件 */
  label: Localized;
  /** 名字只给读屏器读，不画出来（名字已经由旁边的版面写出，如设置页一行左边的标题） */
  hideLabel?: boolean;
  /** 名字后面淡色的“可选”之类 */
  optionalLabel?: Localized;
  /** 控件下面的说明 */
  description?: ReactNode;
  /** 行内错误；有就显示在控件下面（取代说明），并把控件标成无效 */
  error?: Localized;
  /** 控件，通常是 TextField */
  children: ReactNode;
  className?: string;
}

// 名字、控件、说明或错误叠在一起（设计稿 CreateDialog）：间距 6，名字 600 粗。
export function Field({
  label,
  hideLabel = false,
  optionalLabel,
  description,
  error,
  children,
  className,
}: FieldProps) {
  return (
    <BaseField.Root
      invalid={error !== undefined}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      <BaseField.Label
        data-truncate={hideLabel ? "" : undefined}
        className={hideLabel ? `${styles.label} ${styles.hidden}` : styles.label}
      >
        {label}
        {optionalLabel === undefined ? null : (
          <span className={styles.optional}>{optionalLabel}</span>
        )}
      </BaseField.Label>
      {children}
      {error === undefined ? (
        description === undefined ? null : (
          <BaseField.Description className={styles.description}>
            {description}
          </BaseField.Description>
        )
      ) : (
        <BaseField.Error match className={styles.error}>
          {error}
        </BaseField.Error>
      )}
    </BaseField.Root>
  );
}
