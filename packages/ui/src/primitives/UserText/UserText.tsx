import type { ComponentProps } from "react";
import styles from "./UserText.module.css";

export interface UserTextProps extends ComponentProps<"span"> {
  /** 等宽显示：代码、路径、端口、命令（规范板“数字与标识符”） */
  mono?: boolean;
}

// 显示用户自己的内容（项目名、代码、日志、路径）。自动带 data-user-content：
// 伪语言下扫页面时整棵子树跳过，因为这些文字不翻译（技术设计 §6.8 第 5 层）
export function UserText({ mono = false, className, ...rest }: UserTextProps) {
  return (
    <span
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-user-content=""
      data-mono={mono ? "" : undefined}
    />
  );
}
