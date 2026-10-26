import { Icon } from "@runyard/ui";
import styles from "./PaneToggleButton.module.css";

export interface PaneToggleButtonProps {
  /** 按钮的名字（读屏器用）；已收起时是“展开…”，没收起是“收起…” */
  label: string;
  /** 面板现在是不是展开着 */
  expanded: boolean;
  /** 全局侧栏的开关：画 SF Symbols 风格的 sidebar.left；不给就是文件树的开关（双箭头，和侧栏的图案区分开） */
  sidebar?: boolean;
  onClick: () => void;
}

// 收起和展开面板的按钮（全局侧栏、文件树共用外壳）。两块面板的图案不同，同屏时分得清各管哪一块（UI 走查 W5、W6）。
export function PaneToggleButton({ label, expanded, onClick, sidebar }: PaneToggleButtonProps) {
  return (
    <button
      type="button"
      data-sidebar-toggle={sidebar ? "" : undefined}
      className={styles.root}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {sidebar ? (
        <Icon name="sidebar-left" size={24} />
      ) : (
        <Icon name="chevrons-left" className={expanded ? undefined : styles.flipped} />
      )}
    </button>
  );
}
