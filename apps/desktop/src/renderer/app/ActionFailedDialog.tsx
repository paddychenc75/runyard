import { useT } from "@runyard/i18n/react";
import { AlertDialog, Button } from "@runyard/ui";
import type { DesktopError } from "../../shared/library-state.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import { useErrorText } from "./use-error-text.ts";

// 菜单里的动作（创建副本等）失败时的说明：原因取自错误码的文案，项目保持原样
export function ActionFailedDialog({
  error,
  onClose,
}: {
  error: DesktopError;
  onClose: () => void;
}) {
  const t = useT();
  const errorText = useErrorText();
  useOverlay(true);
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("library.action.failed.title")}
      description={errorText(error, "title")}
      actions={
        <Button type="button" variant="primary" onClick={onClose}>
          {t("library.action.dismiss.action")}
        </Button>
      }
    />
  );
}
