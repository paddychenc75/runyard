import { useNotificationService } from "./notifications/notification-context.tsx";
import { notificationText as t } from "./notifications/notification-text.ts";

const copiedMessage = () => t("desktop.notifications.copied.label");
const trashedMessage = () => t("desktop.notifications.trashed.label");

import { useT } from "@runyard/i18n/react";
import type { MenuEntry } from "@runyard/ui";
import { type ReactNode, useState } from "react";
import type { EditResult } from "../../shared/desktop-bridge.ts";
import type { DesktopError } from "../../shared/library-state.ts";
import { ActionFailedDialog } from "./ActionFailedDialog.tsx";
import { TrashConfirmDialog } from "./TrashConfirmDialog.tsx";
import { type UsePlaygroundEditsOptions, usePlaygroundEdits } from "./use-playground-edits.tsx";

export interface ProjectMenu {
  /** 菜单里“打开”那一组之后的全部项（资源库行菜单和工作区“更多”菜单共用，规格 DESKTOP-WORKSPACE“更多菜单”） */
  entries: MenuEntry[];
  /** 找不到文件夹的行：只有重新定位、从资源库移除、复制路径（规格 DESKTOP-LIBRARY-VIEW-32） */
  missingEntries: MenuEntry[];
  /** 菜单选中了某项；不是这里的项返回 false，由调用方处理 */
  select: (id: string) => boolean;
  dialogs: ReactNode;
}

// 两处“更多”菜单的同名项一份实现：重命名到创建副本来自 usePlaygroundEdits（#182），
// 这里补上外部编辑器、访达、终端、复制路径、复制链接和移到废纸篓（#183、#290）。
export interface UseProjectMenuOptions extends UsePlaygroundEditsOptions {
  /** “重新定位…”由调用方接管（资源库表格要在行下面写“选错了文件夹”）；不给就走失败弹窗 */
  onRelocate?: () => void;
}

export function useProjectMenu(options: UseProjectMenuOptions): ProjectMenu {
  const { bridge, row } = options;
  const t = useT();
  const edits = usePlaygroundEdits(options);
  const notifications = useNotificationService();
  const [confirmTrash, setConfirmTrash] = useState(false);
  const [terminalCommand, setTerminalCommand] = useState<string | null>(null);
  const [failed, setFailed] = useState<DesktopError | null>(null);

  const entries: MenuEntry[] = [
    ...edits.entries,
    { type: "separator" },
    { id: "openInEditor", label: t("library.row.openInEditor.action") },
    { id: "reveal", label: t("library.row.reveal.action") },
    { id: "openTerminal", label: t("library.row.openTerminal.action") },
    { id: "copyPath", label: t("library.row.copyPath.action") },
    { id: "copyLink", label: t("library.row.copyLink.action") },
    { type: "separator" },
    { id: "trash", label: t("library.row.trash.action"), tone: "danger" },
  ];
  const missingEntries: MenuEntry[] = [
    { id: "relocate", label: t("library.row.relocate.action") },
    { id: "forget", label: t("library.row.forget.action") },
    { type: "separator" },
    { id: "copyPath", label: t("library.row.copyPath.action") },
  ];

  const settle = (result: EditResult) => {
    if (!result.ok) setFailed(result.error);
  };
  // 确认后弹窗先关，结果回来再决定要不要出失败说明（成功时这一行已经从列表消失）
  const trash = async () => {
    setConfirmTrash(false);
    const result = await bridge.call("playground.trash", row.id);
    if (result.ok) notifications.showToast(trashedMessage());
    settle(result);
  };

  // 终端里有命令在运行的，确认里要写明它会被结束（规格 DESKTOP-TERMINAL-36）；查不到当作没有
  const askTrash = async () => {
    const status = await bridge.call("terminal.status", { project: row.id }).catch(() => null);
    setTerminalCommand(status?.command ?? null);
    setConfirmTrash(true);
  };

  function select(id: string): boolean {
    if (edits.select(id)) return true;
    if (id === "openInEditor") void bridge.call("playground.openInEditor", row.id);
    else if (id === "reveal") void bridge.call("playground.reveal", row.id);
    else if (id === "openTerminal") void bridge.call("playground.openTerminal", row.id);
    else if (id === "copyPath") void bridge.call("playground.copyPath", row.id);
    else if (id === "copyLink")
      void bridge
        .call("clipboard.copy", `runyard://open/${row.name}`)
        .then(() => notifications.showToast(copiedMessage()))
        .catch(() => setFailed({ code: "INTERNAL", params: {} }));
    else if (id === "trash") void askTrash();
    else if (id === "relocate") {
      if (options.onRelocate !== undefined) options.onRelocate();
      else void bridge.call("playground.relocate", row.id).then(settle);
    } else if (id === "forget") void bridge.call("playground.forget", row.id).then(settle);
    else return false;
    return true;
  }

  const dialogs = (
    <>
      {edits.dialogs}
      <TrashConfirmDialog
        open={confirmTrash}
        name={row.name}
        running={row.active}
        terminalCommand={terminalCommand}
        onConfirm={() => void trash()}
        onCancel={() => setConfirmTrash(false)}
      />
      {failed === null ? null : (
        <ActionFailedDialog error={failed} onClose={() => setFailed(null)} />
      )}
    </>
  );
  return { entries, missingEntries, select, dialogs };
}
