import type { ReactNode } from "react";
import styles from "./FixtureBox.module.css";

// 给没有内边距的容器（玻璃面）垫一点内容，样例里的文字才不贴边
export function FixtureBox({ children }: { children: ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
