import { type ReactNode, useState } from "react";
import styles from "./FixtureStage.module.css";

// 浮层类组件（弹窗）的样例舞台：舞台带 transform，里面 position: fixed 的弹窗和遮罩
// 就以舞台为参照，而不是整个视口，同一页里才能并排放几个“打开着”的弹窗。
// 舞台元素通过参数交给 render，弹窗把它当 Portal 的容器。
export function FixtureStage({
  children,
}: {
  children: (container: HTMLElement | null) => ReactNode;
}) {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  return (
    <div ref={setStage} className={styles.root}>
      {children(stage)}
    </div>
  );
}
