import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps, ReactNode } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { Icon } from "../Icon/index.ts";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "neutral" | "destructive" | "glass";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ComponentProps<"button">, "children"> {
  /** 主要按钮每屏只放一个；默认 neutral */
  variant?: ButtonVariant;
  /** 控件规范板：主要和玻璃按钮高 40（lg），次要高 32（md）；不传就按变体取 */
  size?: ButtonSize;
  /** 进行中：保持可聚焦（读屏器还能读到），但不响应点击，图标换成转圈 */
  loading?: boolean;
  /** 文字前面的图标；按钮里不放快捷键符号（规范板“该做与不该做”） */
  icon?: IconName;
  /** 文字内容；纯图标的按钮是 IconButton，不在这里 */
  children: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 14, lg: 16 };

function defaultSize(variant: ButtonVariant): ButtonSize {
  return variant === "primary" || variant === "glass" ? "lg" : "md";
}

export function Button({
  variant = "neutral",
  size = defaultSize(variant),
  loading = false,
  icon,
  disabled = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconName = loading ? "spinner" : icon;
  return (
    <BaseButton
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      disabled={disabled || loading}
      // 进行中的按钮仍然是键盘焦点的一站，读屏器要能读出“忙”；真正禁用的才跳过
      focusableWhenDisabled={loading && !disabled}
      aria-busy={loading ? true : undefined}
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "" : undefined}
    >
      {iconName === undefined ? null : (
        <Icon
          name={iconName}
          size={ICON_SIZE[size]}
          className={loading ? styles.spinner : undefined}
        />
      )}
      <span className={styles.label}>{children}</span>
    </BaseButton>
  );
}
