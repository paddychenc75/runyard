import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
import styles from "./SaveStatus.module.css";

export type SaveStatusKind = "saved" | "unsaved" | "failed";

// 标签条右端的保存状态（设计稿 WebLight：绿色对勾加“已保存”）
export function SaveStatus({ kind }: { kind: SaveStatusKind }) {
  const t = useT();
  const label =
    kind === "saved"
      ? t("desktop.editor.statusSaved.label")
      : kind === "unsaved"
        ? t("desktop.editor.statusUnsaved.label")
        : t("desktop.editor.statusFailed.label");
  return (
    <span className={styles.root} data-status={kind} role="status">
      {kind === "saved" ? <Icon name="check" size={12} className={styles.mark} /> : null}
      {label}
    </span>
  );
}
