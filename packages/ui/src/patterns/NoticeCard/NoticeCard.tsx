import type { Localized } from "@runyard/i18n";
import { numbers } from "@runyard/tokens";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { IconName } from "../../icons/generated/icon-paths.ts";
import { ButtonGroup } from "../../primitives/ButtonGroup/index.ts";
import { GlassSurface } from "../../primitives/GlassSurface/index.ts";
import { Icon } from "../../primitives/Icon/index.ts";
import { IconButton } from "../../primitives/IconButton/index.ts";
import styles from "./NoticeCard.module.css";

export interface NoticeCardProps {
  title: Localized;
  description?: Localized;
  icon?: IconName;
  tone?: "accent" | "warning" | "violet" | "danger";
  actions?: ReactNode;
  children?: ReactNode;
  dismissLabel: Localized;
  onDismiss: () => void;
  /** null 表示必须手动收起；其余从挂载起累计未悬停的时间。 */
  duration?: number | null;
  className?: string;
}
export function NoticeCard({
  title,
  description,
  icon = "info",
  tone = "accent",
  actions,
  children,
  dismissLabel,
  onDismiss,
  duration = null,
  className,
}: NoticeCardProps) {
  const [paused, setPaused] = useState(false);
  const [closing, setClosing] = useState(false);
  const remaining = useRef(duration);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => dismiss.current(), numbers["motion-duration-notice-out"]);
    return () => clearTimeout(timer);
  }, [closing]);
  useEffect(() => {
    if (paused || remaining.current === null) return;
    const started = Date.now();
    const timeout = setTimeout(() => setClosing(true), remaining.current);
    return () => {
      clearTimeout(timeout);
      if (remaining.current !== null)
        remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [paused]);
  return (
    <GlassSurface
      material="menu"
      role="status"
      aria-label={title}
      aria-atomic="true"
      className={`${styles.root} ${className ?? ""}`}
      data-tone={tone}
      data-closing={closing || undefined}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <span className={styles.tile} aria-hidden="true">
        <Icon name={icon} size={16} />
      </span>
      <div className={styles.content}>
        <p className={styles.title}>{title}</p>
        {description === undefined ? null : <p className={styles.description}>{description}</p>}
        {children === undefined ? null : <div className={styles.description}>{children}</div>}
        {actions === undefined ? null : (
          <ButtonGroup size="sm" className={styles.actions}>
            {actions}
          </ButtonGroup>
        )}
      </div>
      <IconButton
        className={styles.close}
        icon="close"
        size="xs"
        variant="neutral"
        label={dismissLabel}
        onClick={() => setClosing(true)}
      />
    </GlassSurface>
  );
}
