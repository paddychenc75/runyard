import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import styles from "./StatusMark.module.css";

export type StatusMarkStatus = "running" | "starting" | "stopped" | "crashed";

export interface StatusMarkProps extends Omit<ComponentProps<"span">, "children"> {
  status: StatusMarkStatus;
  /** 状态的文字；不传就只有一个圆点（此时要给 markLabel，否则只是装饰） */
  children?: Localized;
  /** 只有圆点时，读屏器读的名字 */
  markLabel?: Localized;
}

// 状态标记：圆点加文字。运行中是实心绿点，已停止是空心灰圈，崩溃是实心红方块——
// 形状也不同，不只靠颜色（色盲也分得出，规范板 SpecStates）。
export function StatusMark({ status, children, markLabel, className, ...rest }: StatusMarkProps) {
  const labelled = children === undefined && markLabel !== undefined;
  return (
    <span
      {...rest}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
      data-status={status}
    >
      {labelled ? (
        <span role="img" aria-label={markLabel} className={styles.mark} />
      ) : (
        <span aria-hidden="true" className={styles.mark} />
      )}
      {children === undefined ? null : (
        <span className={styles.text} data-truncate="">
          {children}
        </span>
      )}
    </span>
  );
}
