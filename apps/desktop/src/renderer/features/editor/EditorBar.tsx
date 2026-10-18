import type { Localized } from "@runyard/i18n";
import { Button, ButtonGroup, Icon } from "@runyard/ui";
import styles from "./EditorBar.module.css";

export interface EditorBarProps {
  tone: "info" | "danger";
  title?: Localized;
  message: Localized;
  action?: { label: Localized; onClick: () => void };
  /** 第二个选择（外部修改提示的“保留我的修改”）；有它时 action 是主选择 */
  secondary?: { label: Localized; onClick: () => void };
}

// 编辑器上方的一条提示（文件较大不做高亮、保存失败）：一行字加一个可选的按钮
export function EditorBar({ tone, title, message, action, secondary }: EditorBarProps) {
  return (
    <div className={styles.root} data-tone={tone} role="status">
      <Icon name={tone === "danger" ? "warning" : "exclamation"} size={14} />
      <span className={styles.text}>
        {title === undefined ? null : <strong className={styles.title}>{title}</strong>}
        {message}
      </span>
      <ButtonGroup size="sm">
        {action === undefined ? null : (
          <Button variant="neutral" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
        {secondary === undefined ? null : (
          <Button variant="neutral" onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        )}
      </ButtonGroup>
    </div>
  );
}
