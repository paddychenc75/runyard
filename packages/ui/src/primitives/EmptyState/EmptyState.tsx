import type { Localized } from "@runyard/i18n";
import type { ComponentProps, ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps extends Omit<ComponentProps<"div">, "title"> {
  title: Localized;
  description?: Localized;
  /** 线稿：默认是窗口里一个播放三角（还没有项目）；search 是放大镜加一横（搜索没有结果） */
  art?: "play" | "search";
  /** 主操作和备选操作；组件只负责摆放 */
  children?: ReactNode;
}

// 空状态：一张线稿、标题、一句说明，下面是调用方放的操作。线稿画的是“窗口里一个播放三角”，
// 颜色全走设计变量（在样式文件里），所以深色、浅色都对。
export function EmptyState({
  title,
  description,
  art = "play",
  children,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      {art === "search" ? (
        <svg
          aria-hidden="true"
          className={styles.art}
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <circle className={styles.lens} cx="42" cy="42" r="22" />
          <path className={styles.lens} d="M58.5 58.5 78 78" />
          <path className={styles.minus} d="M33 42h18" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          className={styles.art}
          width="132"
          height="104"
          viewBox="0 0 132 104"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          focusable="false"
        >
          <rect className={styles.back} x="22" y="18" width="88" height="62" rx="10" />
          <rect className={styles.front} x="14" y="26" width="88" height="62" rx="10" />
          <path className={styles.line} d="M14 40h88" />
          <circle className={styles.dot} cx="25" cy="33" r="1.8" />
          <circle className={styles.dot} cx="32" cy="33" r="1.8" />
          <path className={styles.play} d="M51 54l22 12-22 12z" />
        </svg>
      )}
      <h2 className={styles.title}>{title}</h2>
      {description === undefined ? null : <p className={styles.description}>{description}</p>}
      {children}
    </div>
  );
}
