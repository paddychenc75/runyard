import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { ComponentProps } from "react";
import styles from "./ScrollArea.module.css";

export type ScrollAreaOrientation = "vertical" | "horizontal" | "both";

export interface ScrollAreaProps extends ComponentProps<"div"> {
  /** 往哪个方向滚；默认只竖向 */
  orientation?: ScrollAreaOrientation;
}

// 滚动条是细的悬浮条（macOS 风格），行为（滚动、拖动滑块、键盘）交给 Base UI。
// 视口自己是可聚焦的滚动区域，键盘用户能用方向键滚动。
export function ScrollArea({
  orientation = "vertical",
  className,
  children,
  ...rest
}: ScrollAreaProps) {
  return (
    <BaseScrollArea.Root
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-orientation={orientation}
    >
      <BaseScrollArea.Viewport className={styles.viewport}>
        <BaseScrollArea.Content className={styles.content}>{children}</BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      {orientation === "horizontal" ? null : (
        <BaseScrollArea.Scrollbar orientation="vertical" className={styles.scrollbar}>
          <BaseScrollArea.Thumb className={styles.thumb} />
        </BaseScrollArea.Scrollbar>
      )}
      {orientation === "vertical" ? null : (
        <BaseScrollArea.Scrollbar orientation="horizontal" className={styles.scrollbar}>
          <BaseScrollArea.Thumb className={styles.thumb} />
        </BaseScrollArea.Scrollbar>
      )}
    </BaseScrollArea.Root>
  );
}
