import type { Localized } from "@runyard/i18n";
import type { ComponentProps } from "react";
import { Icon } from "../Icon/index.ts";
import styles from "./StepList.module.css";

export type StepStatus = "done" | "current" | "failed" | "pending";

export interface StepListItem {
  id: string;
  label: Localized;
  status: StepStatus;
}

export interface StepListProps extends Omit<ComponentProps<"ol">, "children"> {
  steps: readonly StepListItem[];
  /** 读屏器读的列表名 */
  label: Localized;
}

// 步骤条：几个步骤横排，每步一个标记（完成是对勾，当前是转圈，失败是红色方块里的叉，未到是空心圆）
// 加名字。形状随状态变，不只靠颜色（设计稿 StartFailed）。
export function StepList({ steps, label, className, ...rest }: StepListProps) {
  return (
    <ol
      {...rest}
      aria-label={label}
      className={className === undefined ? styles.root : `${styles.root} ${className}`}
    >
      {steps.map((step) => (
        <li
          key={step.id}
          className={styles.step}
          data-status={step.status}
          aria-current={step.status === "current" ? "step" : undefined}
        >
          <span aria-hidden="true" className={styles.mark}>
            {step.status === "done" ? <Icon name="check" size={12} /> : null}
            {step.status === "failed" ? <Icon name="close" size={12} /> : null}
            {step.status === "current" ? <Icon name="spinner" size={12} /> : null}
          </span>
          <span className={styles.label}>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
