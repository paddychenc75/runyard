import type { Localized } from "@runyard/i18n";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "../Icon/index.ts";
import styles from "./SearchField.module.css";

export interface SearchFieldProps
  extends Omit<ComponentProps<"input">, "aria-label" | "placeholder" | "type" | "children"> {
  /** 输入框的名字，读屏器靠它 */
  label: Localized;
  placeholder?: Localized;
  /** 末端的提示（如退出键的键帽），不可聚焦 */
  trailing?: ReactNode;
}

// 带放大镜的搜索输入框。本身不过滤：值和过滤由使用处管。ref 指向输入框，用来设焦点。
export function SearchField({
  label,
  placeholder,
  trailing,
  className,
  ...rest
}: SearchFieldProps) {
  return (
    <div className={className === undefined ? styles.root : `${styles.root} ${className}`}>
      <Icon name="search" size={18} className={styles.icon} />
      <input
        {...rest}
        type="text"
        className={styles.input}
        data-truncate=""
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {trailing === undefined ? null : <span className={styles.trailing}>{trailing}</span>}
    </div>
  );
}
