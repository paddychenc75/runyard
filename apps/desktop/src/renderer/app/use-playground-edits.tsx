import { useLocale, useT } from "@runyard/i18n/react";
import type { MenuEntry } from "@runyard/ui";
import { type ReactNode, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, PlaygroundRow } from "../../shared/library-state.ts";
import { retentionOf } from "../library-view.ts";
import { ActionFailedDialog } from "./ActionFailedDialog.tsx";
import { AutoCleanDialog } from "./AutoCleanDialog.tsx";
import { RenameDialog } from "./RenameDialog.tsx";
import { SaveTemplateDialog } from "./templates/SaveTemplateDialog.tsx";
import type { RenameFocus } from "./use-rename-draft.ts";

export interface PlaygroundEdits {
  /** 重命名、编辑备注、自动清理、分隔线、另存为模板、创建副本：资源库行菜单和工作区“更多”菜单共用这一份（规格 DESKTOP-WORKSPACE“更多菜单”） */
  entries: MenuEntry[];
  /** 菜单选中了某项；不是这里的项返回 false，由调用方处理 */
  select: (id: string) => boolean;
  /** 弹窗：自动清理、创建副本失败的说明，以及（没有行内编辑的地方）重命名的小弹窗 */
  dialogs: ReactNode;
}

/** 安装依赖或启动中不能改名：管理进程也会拒绝（BUSY），这里先把菜单项灰掉并写明原因 */
export function renameBlocked(state: PlaygroundRow["state"]): boolean {
  return state === "installing" || state === "starting";
}

export interface UsePlaygroundEditsOptions {
  bridge: DesktopBridge;
  row: PlaygroundRow;
  /** 资源库里全部项目的名称（重名校验） */
  taken: readonly string[];
  now: number;
  /** 有行内编辑的地方（资源库行）给它；不给就开小弹窗（工作区） */
  onInlineRename?: (focus: RenameFocus) => void;
  /** 副本建好后（资源库里选中它） */
  onDuplicated?: (id: string) => void;
}

export function usePlaygroundEdits(options: UsePlaygroundEditsOptions): PlaygroundEdits {
  const { bridge, row, taken, now, onInlineRename, onDuplicated } = options;
  const t = useT();
  const locale = useLocale();
  const [dialog, setDialog] = useState<"autoClean" | "saveTemplate" | RenameFocus | null>(null);
  const [failed, setFailed] = useState<DesktopError | null>(null);

  const retention = retentionOf(row, now);
  const state =
    retention.kind === "kept"
      ? t("library.retention.kept.label")
      : retention.kind === "autoClean"
        ? t("library.retention.autoClean.label", { days: retention.daysLeft })
        : t("library.filter.autoClean.label");
  const blocked = renameBlocked(row.state);
  const entries: MenuEntry[] = [
    {
      id: "rename",
      label: t("library.row.rename.action"),
      disabled: blocked,
      ...(blocked ? { hint: t("library.row.renameBusy.hint") } : {}),
    },
    { id: "editNote", label: t("library.row.editNote.action") },
    {
      id: "autoClean",
      label: t("library.row.autoClean.action"),
      hint: t("library.row.autoCleanNow.hint", { state }),
    },
    { type: "separator" },
    // 另存为模板（#292，规格 DESKTOP-TEMPLATES-VIEW-07）；找不到文件夹的行不走这份菜单
    { id: "saveAsTemplate", label: t("library.row.saveAsTemplate.action") },
    { id: "duplicate", label: t("library.row.duplicate.action"), disabled: row.busy },
  ];

  function begin(focus: RenameFocus) {
    if (onInlineRename === undefined) setDialog(focus);
    else onInlineRename(focus);
  }

  async function duplicate() {
    const result = await bridge.call("playground.duplicate", row.id);
    if (result.ok) onDuplicated?.(result.id);
    else setFailed(result.error);
  }

  function select(id: string): boolean {
    if (id === "rename") begin("name");
    else if (id === "editNote") begin("note");
    else if (id === "autoClean") setDialog("autoClean");
    else if (id === "saveAsTemplate") setDialog("saveTemplate");
    else if (id === "duplicate") void duplicate();
    else return false;
    return true;
  }

  const close = () => setDialog(null);
  const dialogs = (
    <>
      {dialog === "autoClean" ? (
        <AutoCleanDialog
          bridge={bridge}
          id={row.id}
          name={row.name}
          days={row.autoClean.enabled ? row.autoClean.days : null}
          onClose={close}
        />
      ) : null}
      {dialog === "name" || dialog === "note" ? (
        <RenameDialog
          bridge={bridge}
          target={{ id: row.id, name: row.name, note: row.note, running: row.active }}
          focus={dialog}
          taken={taken}
          onClose={close}
        />
      ) : null}
      {dialog === "saveTemplate" ? (
        <SaveTemplateDialog
          bridge={bridge}
          project={{ id: row.id, name: row.name }}
          locale={locale}
          onClose={close}
          onUnavailable={(error) => {
            close();
            setFailed(error);
          }}
        />
      ) : null}
      {failed === null ? null : (
        <ActionFailedDialog error={failed} onClose={() => setFailed(null)} />
      )}
    </>
  );
  return { entries, select, dialogs };
}
