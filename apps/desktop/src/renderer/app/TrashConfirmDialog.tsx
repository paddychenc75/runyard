import { useT } from "@runyard/i18n/react";
import { ConfirmDialog } from "@runyard/ui";
import { useOverlay } from "../shared/overlay-context.tsx";

export interface TrashConfirmDialogProps {
  open: boolean;
  name: string;
  running: boolean;
  /** 这个项目的终端里正在运行的命令名（规格 DESKTOP-TERMINAL-36）；没有或终端空闲不给 */
  terminalCommand?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// 移到废纸篓前的确认（设计稿 DeleteConfirm，规格 DESKTOP-LIBRARY-VIEW-43）：说明里写明它现在是否在运行。
// 原生预览会盖住弹窗，打开期间要告诉外壳有浮层（useOverlay）。
export function TrashConfirmDialog({
  open,
  name,
  running,
  terminalCommand,
  onConfirm,
  onCancel,
}: TrashConfirmDialogProps) {
  const t = useT();
  useOverlay(open);
  return (
    <ConfirmDialog
      open={open}
      tone="danger"
      icon="trash"
      title={t("library.trash.title", { name })}
      description={t("library.trash.body", {
        running: running ? "yes" : "no",
        terminalCommand: terminalCommand ?? "none",
      })}
      cancelLabel={t("library.trash.cancel.action")}
      confirmLabel={t("library.trash.confirm.action")}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
