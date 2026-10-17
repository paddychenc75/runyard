import type { ComponentProps } from "react";
import styles from "./SettingsLink.module.css";

// 设置页里的文字链接（设计稿 Settings 的“指定路径…”）：是按钮，不跳转页面，所以用 button 而不是 a。
export function SettingsLink({ className, ...rest }: Omit<ComponentProps<"button">, "type">) {
  return (
    <button
      {...rest}
      type="button"
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    />
  );
}
