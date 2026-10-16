import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import { type IconName, iconPaths } from "../../icons/generated/icon-paths.ts";
import styles from "./Icon.module.css";

export interface IconProps extends Omit<ComponentProps<"svg">, "children" | "name" | "aria-label"> {
  name: IconName;
  /** 边长，设计稿的图标网格是 12、14、16、24；默认 16 */
  size?: number;
  /** 没有 label 就是装饰（读屏器跳过）；有 label 就是一个有名字的图片。纯图标按钮的名字写在按钮上，不写在这里 */
  label?: Localized;
}

export function Icon({ name, size = 16, label, className, ...rest }: IconProps) {
  const icon = iconPaths[name];
  return (
    <svg
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      data-icon={name}
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      focusable="false"
    >
      {icon.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
