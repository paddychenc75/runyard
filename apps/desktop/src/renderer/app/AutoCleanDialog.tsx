import { useT } from "@runyard/i18n/react";
import { Button, Dialog, Field, SegmentedControl, TextField } from "@runyard/ui";
import { useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError } from "../../shared/library-state.ts";
import { PRESET_DAYS, parseCustomDays } from "../create-view.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./AutoCleanDialog.module.css";
import { useErrorText } from "./use-error-text.ts";

export interface AutoCleanDialogProps {
  bridge: DesktopBridge;
  id: string;
  name: string;
  /** 现在的设置：null 是关闭自动清理 */
  days: number | null;
  onClose: () => void;
}

const KEPT = "kept";
const CUSTOM = "custom";

/** 现在的天数落在哪个选项上：预设里有就选它，否则是自定义 */
function choiceOf(days: number | null): string {
  if (days === null) return KEPT;
  return (PRESET_DAYS as readonly number[]).includes(days) ? String(days) : CUSTOM;
}

// “自动清理…”（规格 DESKTOP-LIBRARY-VIEW-40）：在“关闭”和 7、30、90 天或自定义天数之间切换，
// 当前的选项是选中状态。对应设计稿 AutoCleanDialog，使用共享分段控件。
export function AutoCleanDialog({ bridge, id, name, days, onClose }: AutoCleanDialogProps) {
  const t = useT();
  const errorText = useErrorText();
  useOverlay(true);
  const [choice, setChoice] = useState(() => choiceOf(days));
  const [customText, setCustomText] = useState(() =>
    choiceOf(days) === CUSTOM && days !== null ? String(days) : "",
  );
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<DesktopError | null>(null);

  const chosen =
    choice === KEPT ? null : choice === CUSTOM ? parseCustomDays(customText) : Number(choice);
  const valid = choice === KEPT || chosen !== null;

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    const result = await bridge.call("playground.autoClean", { id, days: chosen });
    setBusy(false);
    if (result.ok) onClose();
    else setRejected(result.error);
  }

  const items = [
    { value: KEPT, label: t("library.retention.kept.label") },
    ...PRESET_DAYS.map((count) => ({
      value: String(count),
      label: t("desktop.create.days.label", { days: count }),
    })),
    { value: CUSTOM, label: t("desktop.create.custom.label") },
  ];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      onSubmit={() => void save()}
      title={t("library.autoClean.dialog.title")}
      actions={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("desktop.create.cancel.action")}
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!valid}>
            {t("library.rename.save.action")}
          </Button>
        </>
      }
    >
      {days === null ? (
        <p className={styles.hint}>{t("library.autoClean.off.hint", { name })}</p>
      ) : null}
      <SegmentedControl
        label={t("library.autoClean.dialog.title")}
        items={items}
        value={choice}
        onValueChange={(next) => {
          setChoice(next);
          setRejected(null);
        }}
      />
      {choice === CUSTOM ? (
        <Field
          label={t("desktop.create.customDays.label")}
          error={
            customText !== "" && chosen === null
              ? t("desktop.create.customDaysInvalid.hint")
              : undefined
          }
        >
          <TextField
            inputMode="numeric"
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
          />
        </Field>
      ) : null}
      {chosen === null ? null : (
        <p className={styles.hint}>{t("library.retention.autoClean.tooltip", { days: chosen })}</p>
      )}
      {rejected === null ? null : (
        <p role="alert" className={styles.error}>
          {errorText(rejected, "title")}
        </p>
      )}
    </Dialog>
  );
}
