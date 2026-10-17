import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
import styles from "./SaveStatus.module.css";

export type SaveStatusKind = "saved" | "unsaved" | "saving" | "conflict" | "deleted" | "failed";

// 标签条右端的保存状态（设计稿 WebLight：绿色对勾加“已保存”；SpecStates：“保存中…”琥珀色圆环、“磁盘上有改动”琥珀色警示三角）
export function SaveStatus({ kind }: { kind: SaveStatusKind }) {
  const t = useT();
  const label = {
    saved: t("desktop.editor.statusSaved.label"),
    unsaved: t("desktop.editor.statusUnsaved.label"),
    saving: t("desktop.editor.statusSaving.label"),
    conflict: t("desktop.editor.statusConflict.label"),
    deleted: t("desktop.editor.statusDeleted.label"),
    failed: t("desktop.editor.statusFailed.label"),
  }[kind];
  return (
    <span className={styles.root} data-status={kind} role="status">
      {kind === "saved" ? <Icon name="check" size={12} className={styles.mark} /> : null}
      {kind === "saving" ? <span aria-hidden="true" className={styles.ring} /> : null}
      {kind === "conflict" || kind === "deleted" ? (
        <Icon name="warning" size={12} className={styles.warn} />
      ) : null}
      {label}
    </span>
  );
}
