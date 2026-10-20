import styles from "./PaneToggleButton.module.css";

export interface PaneToggleButtonProps {
  /** 按钮的名字（读屏器用）；已收起时是“展开…”，没收起是“收起…” */
  label: string;
  /** 面板现在是不是展开着 */
  expanded: boolean;
  sidebar?: boolean;
  onClick: () => void;
}

// 收起和展开面板的按钮（侧栏、文件树共用）。图案是一个圆角矩形，左边画一条竖线（两个面板都在左边），
// 用样式画出来而不是新增图标：这样不动共用的图标表和它的截图基准。
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
      <span
        className={styles.glyph}
        aria-hidden="true"
        data-collapsed={expanded ? undefined : ""}
      />
    </button>
  );
}
