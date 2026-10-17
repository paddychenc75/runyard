import type { ComponentProps } from "react";
import { Icon } from "../Icon/Icon.tsx";
import styles from "./MonogramTile.module.css";

export type MonogramTileSize = "sm" | "lg" | "xl";

/** 有官方技术标志可用的几种；其余一律用缩写（授权和品牌规范见根目录 THIRD_PARTY_NOTICES.md） */
export type TechLogo = "html5" | "vue" | "python";

/** 没有标志的内置模板：字母借用该技术的代表色（只借色相，不模仿标志图形）；自定义模板不传，用中性色 */
export type TileBrand = "react" | "go" | "node" | "hono";

export interface MonogramTileProps extends Omit<ComponentProps<"span">, "children"> {
  /** 两个字母左右的缩写；是装饰，读屏器跳过（旁边总有完整的名字）。有 logo 时不显示，只在没有标志时兜底 */
  letters: string;
  /** 技术标志：只用来标明是哪门技术，原样画、用品牌色；不传就显示缩写 */
  logo?: TechLogo;
  /** 字母的代表色；有 logo 时不用 */
  brand?: TileBrand;
  /** sm 在表格行里，lg 在胶囊按钮里，xl 在弹窗标题前（设计稿 CreateDialog） */
  size?: MonogramTileSize;
}

// 图标网格 12、14、16、24：标志比方块小一圈，留出边距
const LOGO_SIZE: Record<MonogramTileSize, number> = { sm: 14, lg: 16, xl: 24 };

export function MonogramTile({
  letters,
  logo,
  brand,
  size = "sm",
  className,
  ...rest
}: MonogramTileProps) {
  return (
    <span
      {...rest}
      aria-hidden="true"
      data-user-content=""
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-size={size}
      data-logo={logo}
      data-brand={brand}
    >
      {logo === undefined ? letters : <Icon name={`logo-${logo}`} size={LOGO_SIZE[size]} />}
    </span>
  );
}
