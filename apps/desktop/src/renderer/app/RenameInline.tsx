import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup } from "@runyard/ui";
import { useEffect, useRef } from "react";
import styles from "./RenameInline.module.css";
import { renameTerminalNote } from "./rename-terminal-note.ts";
import type { RenameDraft } from "./use-rename-draft.ts";

// 资源库行的行内编辑（设计稿 RenameInline）：名称框、说明、备注框占住名称到模板那几列，
// 取消和保存在最右。“重命名…”时焦点在名称框并全选，“编辑备注…”时焦点在备注框（规格
// DESKTOP-LIBRARY-VIEW 的“行内重命名与编辑备注”）。状态在 RenameDraft 里，工作区的小弹窗用同一份。

export function RenameInlineFields({ draft }: { draft: RenameDraft }) {
  const t = useT();
  const { session } = draft;
  const nameRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const target = session?.target.id;
  const focus = session?.focus;
  // 一次编辑只在开始时聚焦一次；之后点哪里光标就在哪里
  useEffect(() => {
    if (target === undefined) return;
    const input = focus === "note" ? noteRef.current : nameRef.current;
    input?.focus();
    input?.select();
  }, [target, focus]);
  if (session === null) return null;
  const error = draft.nameError;
  const hint = session.target.running
    ? t("library.rename.nameRunning.hint")
    : t("library.rename.nameFolder.hint");
  const terminalNote = renameTerminalNote(t, session.terminal);
  return (
    <div className={styles.fields}>
      <input
        ref={nameRef}
        className={styles.name}
        type="text"
        value={session.name}
        aria-label={t("desktop.create.name.label")}
        aria-invalid={error !== undefined}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={draft.onKeyDown}
        onChange={(event) => draft.setName(event.target.value)}
      />
      <div className={styles.hint} data-invalid={error === undefined ? undefined : ""}>
        {error ?? (terminalNote === null ? hint : `${hint}${terminalNote}`)}
      </div>
      <input
        ref={noteRef}
        className={styles.note}
        type="text"
        value={session.note}
        aria-label={t("desktop.create.note.label")}
        placeholder={t("desktop.create.note.placeholder")}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={draft.onKeyDown}
        onChange={(event) => draft.setNote(event.target.value)}
      />
    </div>
  );
}

export function RenameInlineActions({ draft }: { draft: RenameDraft }) {
  const t = useT();
  return (
    <ButtonGroup size="sm" align="end" className={styles.actions}>
      <Button type="button" onClick={draft.cancel}>
        {t("desktop.create.cancel.action")}
      </Button>
      <Button
        type="button"
        variant="primary"
        disabled={!draft.canSave}
        onClick={() => void draft.save()}
      >
        {t("library.rename.save.action")}
      </Button>
    </ButtonGroup>
  );
}
