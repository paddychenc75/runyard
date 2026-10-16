import { UserText } from "@runyard/ui";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./TabContent.module.css";

export interface TabContentProps {
  tab: TabRow;
}

// 项目标签页左边的内容区：文件树和编辑器随后续 issue，现在只有项目名。运行状态和
// 停止/运行按钮在顶栏的运行条（RunBar，#176），预览或脚本输出在右边，控制台在底部。
export function TabContent({ tab }: TabContentProps) {
  return (
    <section className={styles.root} data-tab={tab.id}>
      <h1 className={styles.title}>
        <UserText>{tab.name}</UserText>
      </h1>
    </section>
  );
}
