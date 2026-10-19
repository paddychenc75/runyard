import type { Localized } from "@runyard/i18n";
import type { ComponentProps, ReactNode } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { ButtonGroup } from "../ButtonGroup/index.ts";
import { Icon } from "../Icon/index.ts";
import styles from "./Banner.module.css";

export type BannerTone = "warning" | "danger";

export interface BannerProps extends Omit<ComponentProps<"section">, "title"> {
  tone?: BannerTone;
  icon?: IconName;
  title: Localized;
  /** 标题下面的一句说明 */
  description?: Localized;
  /** 说明下面的详情（几行字、键值对）；组件只负责摆放 */
  children?: ReactNode;
  /** 底部的操作按钮 */
  actions?: ReactNode;
}

// 横幅：一块带图标的提示卡，标题加说明，下面是调用方放的详情和操作。
// 用在预览区上方的说明（设计稿 StartFailed 的端口被占用）。
export function Banner({
  tone = "warning",
  icon = "warning",
  title,
  description,
  children,
  actions,
  className,
  ...rest
}: BannerProps) {
  return (
    <section
      role="status"
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-tone={tone}
    >
      <div className={styles.head}>
        <span aria-hidden="true" className={styles.tile}>
          <Icon name={icon} size={20} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title}>{title}</h2>
          {description === undefined ? null : <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {children === undefined ? null : <div className={styles.body}>{children}</div>}
      {actions === undefined ? null : <ButtonGroup size="md">{actions}</ButtonGroup>}
    </section>
  );
}
