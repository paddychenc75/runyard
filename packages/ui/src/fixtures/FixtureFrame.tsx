import type { ReactNode } from "react";
import styles from "./FixtureFrame.module.css";

// 给需要固定大小的容器（滚动区、侧栏）一个有尺寸的外框，样例才有东西可滚
export function FixtureFrame({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
