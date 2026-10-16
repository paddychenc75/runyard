import type { ComponentProps } from "react";
import styles from "./Truncate.module.css";

export type TruncateProps = ComponentProps<"span">;

// 一行放不下就用省略号。flex 或 grid 的子项里要它真的收缩，所以自带 min-inline-size: 0
export function Truncate({ className, ...rest }: TruncateProps) {
  return (
    <span
      {...rest}
      data-truncate=""
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    />
  );
}
