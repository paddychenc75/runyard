import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, IconButton, Tooltip } from "@runyard/ui";
import { toolName } from "./tool-view.ts";

export function ToolPathActions({
  tool,
  dirty,
  busy,
  onSave,
  onCancel,
  onChoose,
}: {
  tool: string;
  dirty: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
  onChoose: () => void;
}) {
  const t = useT();
  const label = t("settings.runtime.choosePath.aria", { tool: toolName(tool) });
  return (
    <>
      <Tooltip content={label}>
        <IconButton icon="more" size="sm" label={label} disabled={busy} onClick={onChoose} />
      </Tooltip>
      {dirty ? (
        <ButtonGroup size="sm">
          <Button loading={busy} onClick={onSave}>
            {t("settings.runtime.savePath.action")}
          </Button>
          <Button disabled={busy} onClick={onCancel}>
            {t("settings.dialog.cancel.action")}
          </Button>
        </ButtonGroup>
      ) : null}
    </>
  );
}
