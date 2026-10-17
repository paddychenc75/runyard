import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { ActionFailedDialog } from "./ActionFailedDialog.tsx";
import styles from "./FolderMissing.module.css";
import { MissingNote } from "./MissingNote.tsx";
import { useRelocate } from "./use-relocate.ts";

export interface FolderMissingProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 项目标签页里文件夹找不到时的画面（规格 DESKTOP-LIBRARY-VIEW“找不到项目文件夹”：对它“打开”不启动，
// 显示同一条说明；PR #327 留下的“恢复的标签页”也走这里）。说明和三个操作与资源库行下面的是同一块。
export function FolderMissing({ bridge, tab }: FolderMissingProps) {
  const t = useT();
  const relocating = useRelocate(bridge);
  return (
    <div className={styles.root} data-folder-missing={tab.id}>
      <span className={styles.badge}>
        <Icon name="warning" size={24} />
      </span>
      <h2 className={styles.title}>{t("library.missing.status.label")}</h2>
      <div className={styles.note}>
        <MissingNote
          bridge={bridge}
          id={tab.id}
          name={tab.name}
          folder={tab.folder}
          mismatch={relocating.mismatchId === tab.id}
          onRelocate={() => void relocating.relocate(tab.id)}
          onForget={() => void relocating.forget(tab.id)}
        />
      </div>
      {relocating.failed === null ? null : (
        <ActionFailedDialog error={relocating.failed} onClose={relocating.clearFailed} />
      )}
    </div>
  );
}
