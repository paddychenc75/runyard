import type { ComponentProps } from "react";
import styles from "./Kbd.module.css";

export type KbdProps = ComponentProps<"kbd">;

// 键帽：一个按键或一组快捷键的符号（⌘N、esc）。文字由使用处给，组件不翻译、不判断系统。
export function Kbd({ className, ...rest }: KbdProps) {
  return (
    <kbd
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    />
  );
}
