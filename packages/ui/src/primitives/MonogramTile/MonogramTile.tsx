import type { ComponentProps } from "react";
import styles from "./MonogramTile.module.css";

export type MonogramTileSize = "sm" | "lg";

export interface MonogramTileProps extends Omit<ComponentProps<"span">, "children"> {
  /** 两个字母左右的缩写；是装饰，读屏器跳过（旁边总有完整的名字） */
  letters: string;
  /** sm 在表格行里，lg 在胶囊按钮里 */
  size?: MonogramTileSize;
}

export function MonogramTile({ letters, size = "sm", className, ...rest }: MonogramTileProps) {
  return (
    <span
      {...rest}
      aria-hidden="true"
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-size={size}
    >
      {letters}
    </span>
  );
}
