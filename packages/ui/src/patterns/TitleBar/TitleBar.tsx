import type { ComponentProps } from "react";
import styles from "./TitleBar.module.css";

export type TitleBarControls = "start" | "end" | "none";

export interface TitleBarProps extends ComponentProps<"header"> {
  /**
   * 系统的窗口按钮（红黄绿或最小化关闭）画在这一侧的哪头，这一头要让出位置；none 是不让。
   * 值来自主进程算好的启动信息，组件自己不判断系统（技术设计 §6.7“平台变体”）。
   */
  controls?: TitleBarControls;
}

// 自绘标题栏的一条：空白处能拖动窗口，窗口按钮的位置留空，里面的控件不被拖动吞掉点击。
export function TitleBar({ controls = "start", className, children, ...rest }: TitleBarProps) {
  return (
    <header
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-controls={controls}
    >
      {controls === "none" ? null : <span aria-hidden="true" className={styles.spacer} />}
      <div className={styles.content}>{children}</div>
    </header>
  );
}
