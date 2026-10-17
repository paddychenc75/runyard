import { SegmentedControl, type SegmentedControlProps } from "@runyard/ui";
import styles from "./Segments.module.css";

// 设置页的分段选择：字号 12、未选中的字重 500（设计稿 Settings），比对话框里的通用分段选择小一档。
export function Segments(props: Omit<SegmentedControlProps, "className">) {
  return <SegmentedControl {...props} className={styles.segments} />;
}
