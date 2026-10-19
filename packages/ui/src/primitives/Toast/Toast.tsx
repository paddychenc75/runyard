import type { Localized } from "@runyard/i18n";
import { numbers } from "@runyard/tokens";
import { useEffect, useRef, useState } from "react";
import { GlassSurface } from "../GlassSurface/index.ts";
import { Icon } from "../Icon/index.ts";
import styles from "./Toast.module.css";
export interface ToastProps {
  message: Localized;
  onDismiss: () => void;
  duration?: number | null;
  className?: string;
}
export function Toast({ message, onDismiss, duration = 2000, className }: ToastProps) {
  const [closing, setClosing] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => dismiss.current(), numbers["motion-duration-notice-out"]);
    return () => clearTimeout(timer);
  }, [closing]);
  useEffect(() => {
    if (duration === null) return;
    const timer = setTimeout(() => setClosing(true), duration);
    return () => clearTimeout(timer);
  }, [duration]);
  return (
    <GlassSurface
      material="menu"
      role="status"
      className={`${styles.root} ${className ?? ""}`}
      data-closing={closing || undefined}
    >
      <Icon name="check" size={14} />
      <span>{message}</span>
    </GlassSurface>
  );
}
