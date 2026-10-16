import { Button as BaseButton } from "@base-ui/react/button";
import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { Icon } from "../Icon/index.ts";
import styles from "./IconButton.module.css";

export type IconButtonSize = "xs" | "sm" | "md";
export type IconButtonVariant = "ghost" | "neutral";

export interface IconButtonProps
  extends Omit<ComponentProps<"button">, "children" | "aria-label" | "title"> {
  icon: IconName;
  /** 纯图标按钮没有可见文字，名字必填，读屏器靠它；要让鼠标用户也看到，外面套 <Tooltip> */
  label: Localized;
  /** 点击区域：xs 是标签里的小关闭钮，sm 28，md 32（设计变量里的控件高度） */
  size?: IconButtonSize;
  /** ghost 平时没有底色，悬停才出现；neutral 平时就有一层中性填充 */
  variant?: IconButtonVariant;
}

const ICON_SIZE: Record<IconButtonSize, number> = { xs: 10, sm: 14, md: 16 };

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  className,
  ...rest
}: IconButtonProps) {
  return (
    <BaseButton
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      aria-label={label}
      data-size={size}
      data-variant={variant}
    >
      <Icon name={icon} size={ICON_SIZE[size]} />
    </BaseButton>
  );
}
