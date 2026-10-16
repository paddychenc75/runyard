import type { Localized } from "@runyard/i18n";
import type { ComponentProps, ReactNode } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { Icon } from "../Icon/index.ts";
import styles from "./Badge.module.css";

export type BadgeVariant = "solid" | "dashed" | "violet";

export interface BadgeProps extends Omit<ComponentProps<"span">, "children"> {
  /** solid：带底色的实线胶囊；dashed：虚线轮廓，更轻；violet：紫色底，用于“由别人（如智能体）创建”这类来源标记 */
  variant?: BadgeVariant;
  icon?: IconName;
  /** 界面自己的文字是 Localized；用户的内容（如智能体的名字）用 <UserText> 包起来 */
  children: Localized | ReactNode;
}

export function Badge({ variant = "solid", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-variant={variant}
    >
      {icon === undefined ? null : <Icon name={icon} size={12} />}
      <span className={styles.text} data-truncate="">
        {children}
      </span>
    </span>
  );
}
