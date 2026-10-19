import { T, useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import styles from "./MissingNote.module.css";

export interface MissingNoteProps {
  bridge: DesktopBridge;
  id: string;
  name: string;
  /** 原路径的显示写法（主目录缩成 ~） */
  folder: string;
  /** 刚才选的文件夹不是这个项目 */
  mismatch: boolean;
  onRelocate: () => void;
  onForget: () => void;
}

// “找不到文件夹”的说明（设计稿 FolderMissing，规格 DESKTOP-LIBRARY-VIEW-49）：原路径写在前面，
// 后面三个操作——重新定位…、从资源库移除、在访达中显示上一级文件夹。选错文件夹时多一行红字，什么都没改。
// 资源库的行下面和项目标签页里是同一块。
export function MissingNote({
  bridge,
  id,
  name,
  folder,
  mismatch,
  onRelocate,
  onForget,
}: MissingNoteProps) {
  const t = useT();
  return (
    <div className={styles.root} data-missing-note={id}>
      <Icon name="warning" size={16} className={styles.icon} />
      <div className={styles.text}>
        <p className={styles.body}>
          <T
            k="library.missing.body"
            values={{ path: folder }}
            components={{ mono: <UserText mono className={styles.path} /> }}
          />
        </p>
        {mismatch ? (
          <p role="alert" className={styles.problem} data-relocate-mismatch="">
            <T
              k="library.missing.mismatch.label"
              values={{ name }}
              components={{ user: <UserText /> }}
            />
          </p>
        ) : null}
      </div>
      <ButtonGroup size="md" className={styles.actions}>
        <Button variant="primary" onClick={onRelocate}>
          {t("library.row.relocate.action")}
        </Button>
        <Button onClick={onForget}>{t("library.row.forget.action")}</Button>
        <button
          type="button"
          className={styles.link}
          onClick={() => void bridge.call("playground.revealParent", id)}
        >
          {t("library.missing.revealParent.action")}
        </button>
      </ButtonGroup>
    </div>
  );
}
