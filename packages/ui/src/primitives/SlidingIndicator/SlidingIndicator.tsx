import type { RefObject } from "react";
import styles from "./SlidingIndicator.module.css";

export interface SlidingIndicatorProps {
  indicatorRef: RefObject<HTMLSpanElement | null>;
  /** 外观（底色、圆角、阴影）由使用它的组件给 */
  className?: string;
}

// 选中背景本身：装饰，读屏器跳过；位置由 useSlidingIndicator 写的 CSS 变量决定
export function SlidingIndicator({ indicatorRef, className }: SlidingIndicatorProps) {
  return (
    <span
      ref={indicatorRef}
      aria-hidden="true"
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    />
  );
}
