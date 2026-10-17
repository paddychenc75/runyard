import { useFormat, useT } from "@runyard/i18n/react";
import { Button } from "@runyard/ui";
import { MAX_OPEN_BYTES } from "../../../shared/editor-files.ts";
import styles from "./FileNotice.module.css";
import type { FileTab } from "./file-tab.ts";
import { baseName } from "./path-names.ts";

export interface FileNoticeProps {
  /** 选中的文件标签；没有文件标签是 null */
  tab: FileTab | null;
  onReveal: (path: string) => void;
  onOpenExternal: (path: string) => void;
}

// 编辑区里没有代码可显示时的说明：没有打开的文件、读取中、不是文本、太大、读取失败
// （规格 DESKTOP-EDITOR-21、DESKTOP-EDITOR-22）。二进制内容不会当文字显示。
export function FileNotice({ tab, onReveal, onOpenExternal }: FileNoticeProps) {
  const t = useT();
  const fmt = useFormat();
  if (tab === null) {
    return (
      <div className={styles.root} data-notice="empty">
        <h2 className={styles.title}>{t("desktop.editor.empty.title")}</h2>
        <p className={styles.body}>{t("desktop.editor.empty.body")}</p>
      </div>
    );
  }
  const name = baseName(tab.path);
  switch (tab.view) {
    case "loading":
      return (
        <div className={styles.root} data-notice="loading">
          <p className={styles.body}>{t("desktop.editor.loading.label")}</p>
        </div>
      );
    case "binary":
      return (
        <div className={styles.root} data-notice="binary">
          <h2 className={styles.title}>{t("desktop.editor.binary.title")}</h2>
          <p className={styles.body}>
            {t("desktop.editor.binary.body", { name, size: fmt.fileSize(tab.size) })}
          </p>
          <Button variant="neutral" onClick={() => onReveal(tab.path)}>
            {t("desktop.editor.reveal.action")}
          </Button>
        </div>
      );
    case "too-large":
      return (
        <div className={styles.root} data-notice="too-large">
          <h2 className={styles.title}>{t("desktop.editor.tooLarge.title")}</h2>
          <p className={styles.body}>
            {t("desktop.editor.tooLarge.body", {
              name,
              size: fmt.fileSize(tab.size),
              limit: fmt.fileSize(MAX_OPEN_BYTES),
            })}
          </p>
          <Button variant="neutral" onClick={() => onOpenExternal(tab.path)}>
            {t("desktop.editor.openExternal.action")}
          </Button>
        </div>
      );
    case "failed":
      return (
        <div className={styles.root} data-notice="failed">
          <h2 className={styles.title}>{t("desktop.editor.failed.title")}</h2>
          <p className={styles.body}>{t("desktop.editor.failed.body", { name })}</p>
        </div>
      );
    case "text":
      return null;
  }
}
