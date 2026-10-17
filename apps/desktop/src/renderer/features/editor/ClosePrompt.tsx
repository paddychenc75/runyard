import { useT } from "@runyard/i18n/react";
import { AlertDialog, Button } from "@runyard/ui";
import { useRef } from "react";
import { useOverlay } from "../../shared/overlay-context.tsx";
import type { ClosePromptAnswer } from "./editor-session.ts";

export interface ClosePromptProps {
  /** 要问的文件名；不用问是 null */
  name: string | null;
  onAnswer: (answer: ClosePromptAnswer) => void;
}

// 关闭有未保存修改的文件标签时的询问（规格 DESKTOP-EDITOR-19）：保存、不保存、取消；焦点先在“取消”。
// 原生预览视图会盖住弹窗，打开期间要告诉外壳有浮层。
export function ClosePrompt({ name, onAnswer }: ClosePromptProps) {
  const t = useT();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // 关闭动画期间 name 已是 null，标题仍要显示上一次的文件名
  const last = useRef(name);
  if (name !== null) last.current = name;
  useOverlay(name !== null);
  const shown = name ?? last.current;
  if (shown === null) return null;
  return (
    <AlertDialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open) onAnswer("cancel");
      }}
      title={t("desktop.editor.closePrompt.title", { name: shown })}
      description={t("desktop.editor.closePrompt.body")}
      initialFocus={cancelRef}
      actions={
        <>
          <Button ref={cancelRef} variant="neutral" onClick={() => onAnswer("cancel")}>
            {t("desktop.editor.closeCancel.action")}
          </Button>
          <Button variant="neutral" onClick={() => onAnswer("discard")}>
            {t("desktop.editor.closeDiscard.action")}
          </Button>
          <Button variant="primary" size="md" onClick={() => onAnswer("save")}>
            {t("desktop.editor.closeSave.action")}
          </Button>
        </>
      }
    />
  );
}
