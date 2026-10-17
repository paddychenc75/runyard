import type { Localized } from "@runyard/i18n";
import { Button, Icon } from "@runyard/ui";
import styles from "./EditorBar.module.css";

export interface EditorBarProps {
  tone: "info" | "danger";
  title?: Localized;
  message: Localized;
  action?: { label: Localized; onClick: () => void };
}

// 编辑器上方的一条提示（文件较大不做高亮、保存失败）：一行字加一个可选的按钮
export function EditorBar({ tone, title, message, action }: EditorBarProps) {
  return (
    <div className={styles.root} data-tone={tone} role="status">
      <Icon name={tone === "danger" ? "warning" : "exclamation"} size={14} />
      <span className={styles.text}>
        {title === undefined ? null : <strong className={styles.title}>{title}</strong>}
        {message}
      </span>
      {action === undefined ? null : (
        <Button variant="neutral" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
