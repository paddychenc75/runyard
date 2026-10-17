import { useT } from "@runyard/i18n/react";
import { useEffect, useRef } from "react";
import styles from "./FileTree.module.css";
import { baseNameOf, type EditDraft } from "./file-tree-model.ts";

export interface FileTreeNameInputProps {
  draft: EditDraft;
  /** 输入框旁的失败说明（已是翻译好的句子）；没有失败是 null */
  problem: string | null;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

// 行内输入名字（新建和重命名共用，设计稿 RenameInline 的输入框样式）：回车提交、Esc 取消、
// 失去焦点取消；提交失败时输入框保留，说明写在框的下面（DESKTOP-EDITOR-07、08）。
export function FileTreeNameInput({ draft, problem, onSubmit, onCancel }: FileTreeNameInputProps) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const initial = draft.mode === "rename" ? baseNameOf(draft.path) : "";
  useEffect(() => {
    const input = ref.current;
    if (input === null) return;
    input.focus();
    // 改名时选中不含扩展名的部分，和访达一致
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  const label =
    draft.mode === "rename" ? t("workspace.files.rename.aria") : t("workspace.files.create.aria");
  return (
    <>
      <input
        ref={ref}
        className={styles.nameInput}
        defaultValue={initial}
        aria-label={label}
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? undefined : "file-tree-problem"}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit(event.currentTarget.value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCancel}
      />
      {problem === null ? null : (
        <span id="file-tree-problem" role="alert" className={styles.problem}>
          {problem}
        </span>
      )}
    </>
  );
}
