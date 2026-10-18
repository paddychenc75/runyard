import { useT } from "@runyard/i18n/react";
import { Button, Dialog, Field, TextField } from "@runyard/ui";
import { useEffect, useRef } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import { renameTerminalNote } from "./rename-terminal-note.ts";
import { type RenameFocus, type RenameTarget, useRenameDraft } from "./use-rename-draft.ts";

export interface RenameDialogProps {
  bridge: DesktopBridge;
  target: RenameTarget;
  focus: RenameFocus;
  /** 资源库里全部项目的名称，校验重名用 */
  taken: readonly string[];
  onClose: () => void;
}

// 工作区里的“重命名…”和“编辑备注…”（规格 desktop/workspace“工作区的‘更多’菜单”）：工作区里没有表格行，
// 所以开一个小弹窗，内容（名称、备注、说明、校验、取消与保存）与资源库的行内编辑相同，用的是同一份草稿。
// 弹窗的样式沿用行内编辑（设计稿 RenameInline），板子待 #254。
export function RenameDialog({ bridge, target, focus, taken, onClose }: RenameDialogProps) {
  const t = useT();
  useOverlay(true);
  const draft = useRenameDraft(bridge, taken, { target, focus });
  const { session } = draft;
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  // 保存成功后草稿清空，弹窗跟着关
  useEffect(() => {
    if (session === null) onClose();
  }, [session, onClose]);
  if (session === null) return null;
  const baseHint = session.target.running
    ? t("library.rename.nameRunning.hint")
    : t("library.rename.nameFolder.hint");
  const terminalNote = renameTerminalNote(t, session.terminal);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !session.busy) onClose();
      }}
      onSubmit={() => void draft.save()}
      title={focus === "note" ? t("library.note.dialog.title") : t("library.rename.dialog.title")}
      initialFocus={focus === "note" ? noteRef : nameRef}
      actions={
        <>
          <Button type="button" onClick={onClose} disabled={session.busy}>
            {t("desktop.create.cancel.action")}
          </Button>
          <Button type="submit" variant="primary" loading={session.busy} disabled={!draft.canSave}>
            {t("library.rename.save.action")}
          </Button>
        </>
      }
    >
      <Field
        label={t("desktop.create.name.label")}
        error={draft.nameError}
        description={terminalNote === null ? baseHint : `${baseHint}${terminalNote}`}
      >
        <TextField
          ref={nameRef}
          value={session.name}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => draft.setName(event.target.value)}
        />
      </Field>
      <Field
        label={t("desktop.create.note.label")}
        optionalLabel={t("desktop.create.optional.label")}
      >
        <TextField
          ref={noteRef}
          value={session.note}
          placeholder={t("desktop.create.note.placeholder")}
          onChange={(event) => draft.setNote(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
