import type { ReactNode } from "react";
import styles from "./FixtureStack.module.css";

// 样例里把几个并排（或上下排）的元素摆整齐。样例文件不写内联样式（style-tokens），布局统一在这里
export function FixtureStack({
  direction = "row",
  children,
}: {
  direction?: "row" | "column";
  children: ReactNode;
}) {
  return (
    <div className={styles.root} data-direction={direction}>
      {children}
    </div>
  );
}
