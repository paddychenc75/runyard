import { useT } from "@runyard/i18n/react";
import { type ReactNode, useEffect, useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import styles from "./PreviewSlot.module.css";

export interface PreviewSlotProps {
  bridge: DesktopBridge;
  /** 预览还没就绪时占位区里显示的内容 */
  placeholder: ReactNode;
  /** 有浮层盖住时主进程截来的那一帧（图片地址）；没有就是 null */
  frame: string | null;
  /** 盖在占位区（含截图）上的一层提示，如崩溃说明；不给就没有 */
  overlay?: ReactNode;
  /** 占位区位置变了的回调（外壳据此判断浮层是否盖住它） */
  onBounds?: (bounds: Bounds | null) => void;
}

// 预览占位（技术设计 §6.7）：一个占位的 div，把自己在窗口里的位置和大小报给主进程，
// 主进程把预览视图摆在上面。预览还没有（启动中、已停止）时它显示占位内容；
// 有浮层盖住时它显示截来的那一帧，视图则被主进程藏起。
export function PreviewSlot({ bridge, placeholder, frame, overlay, onBounds }: PreviewSlotProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onBounds);
  report.current = onBounds;
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let last = "";
    const send = () => {
      const rect = element.getBoundingClientRect();
      const bounds = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      const key = JSON.stringify(bounds);
      if (key === last) return;
      last = key;
      report.current?.(bounds);
      void bridge.call("preview.bounds", bounds);
    };
    send();
    // 占位区自己变大小（拖窗口、面板伸缩）和整个窗口变（位置随之变）都要重报
    const observer = new ResizeObserver(send);
    observer.observe(element);
    window.addEventListener("resize", send);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", send);
      report.current?.(null);
      void bridge.call("preview.bounds", null);
    };
  }, [bridge]);
  return (
    <div ref={ref} className={styles.slot} data-preview-slot="">
      {frame === null ? (
        <div className={styles.placeholder}>{placeholder}</div>
      ) : (
        <img
          className={styles.frame}
          src={frame}
          alt={t("desktop.preview.frame.label")}
          data-preview-frame=""
        />
      )}
      {overlay === undefined ? null : (
        <div className={styles.overlay} data-framed={frame !== null ? "" : undefined}>
          {overlay}
        </div>
      )}
    </div>
  );
}
