import { T, useT } from "@runyard/i18n/react";
import {
  Button,
  Dialog,
  Field,
  Icon,
  MonogramTile,
  SegmentedControl,
  Switch,
  TextField,
  UserText,
} from "@runyard/ui";
import { type ChangeEvent, type FocusEvent, useMemo, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { DesktopError, LibraryState } from "../../shared/library-state.ts";
import {
  DEFAULT_DAYS,
  defaultName,
  nameProblem,
  PRESET_DAYS,
  parseCustomDays,
} from "../create-view.ts";
import { brandOf, logoOf, monogramOf, pickLocalizedText } from "../library-view.ts";
import { useOverlay } from "../shared/overlay-context.tsx";
import styles from "./CreateDialog.module.css";
import { useErrorText } from "./use-error-text.ts";

export interface CreateDialogProps {
  bridge: DesktopBridge;
  library: LibraryState;
  templateId: string;
  /** 预先填好的名称（资源库“没有结果”画面的“新建项目，名称用…”）；不给就用默认名称 */
  initialName?: string;
  onClose: () => void;
  /** “换一个模板”：回到选择器 */
  onChangeTemplate: () => void;
}

const CUSTOM = "custom";

// 新建弹窗（设计稿 CreateDialog、CreateDialogOn）：名称、备注、自动清理三项都有默认值，
// 直接回车就创建并运行（规格 DESKTOP-CREATE-FLOW-06 至 13）。名称打开时全选。
export function CreateDialog({
  bridge,
  library,
  templateId,
  initialName,
  onClose,
  onChangeTemplate,
}: CreateDialogProps) {
  const t = useT();
  const errorText = useErrorText();
  // 预览是原生视图，会盖住网页里的浮层：打开期间告诉外壳，预览区据此换成截图
  useOverlay(true);
  const existing = useMemo(
    () => library.playgrounds.map((playground) => playground.name),
    [library.playgrounds],
  );
  const template = library.templates.find((candidate) => candidate.id === templateId);
  const templateName =
    template === undefined ? templateId : pickLocalizedText(template.name, library.locale);
  const [name, setName] = useState(() => initialName ?? defaultName(templateId, existing));
  const [note, setNote] = useState("");
  const [autoClean, setAutoClean] = useState(false);
  const [choice, setChoice] = useState<string>(String(DEFAULT_DAYS));
  const [customText, setCustomText] = useState("");
  const [rejected, setRejected] = useState<DesktopError | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectedOnce = useRef(false);

  const problem = nameProblem(name, existing);
  const days = choice === CUSTOM ? parseCustomDays(customText) : Number(choice);
  const customInvalid = autoClean && choice === CUSTOM && customText !== "" && days === null;
  const canSubmit = problem === null && (!autoClean || days !== null) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const result = await bridge.call("playground.create", {
      template: templateId,
      name,
      note: note.trim(),
      autoClean: autoClean ? days : null,
    });
    setBusy(false);
    if (result.ok) onClose();
    else setRejected(result.error);
  }

  // 打开时名称全选；之后点进去按平常的方式放光标
  function selectOnOpen(event: FocusEvent<HTMLInputElement>) {
    if (selectedOnce.current) return;
    selectedOnce.current = true;
    event.currentTarget.select();
  }

  function nameError() {
    if (name === "" && rejected === null) return undefined;
    if (problem === "taken") return t("desktop.create.nameTaken.hint");
    if (problem === "invalid") return t("desktop.create.nameInvalid.hint");
    if (rejected === null) return undefined;
    // 界面的判断放过、管理进程不认的（保留名等）：原样显示它的说法
    if (rejected.code === "NAME_EXISTS") return t("desktop.create.nameTaken.hint");
    if (rejected.code === "NAME_INVALID") return t("desktop.create.nameInvalid.hint");
    return errorText(rejected, "title");
  }

  const presetItems = [
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
      onSubmit={() => void submit()}
      title={t("desktop.create.dialog.title")}
      subtitle={t("desktop.create.template.label", { name: templateName })}
      leading={
        <MonogramTile
          letters={monogramOf(templateId)}
          logo={logoOf(templateId)}
          brand={brandOf(templateId)}
          size="xl"
        />
      }
      headerAction={
        <Button type="button" onClick={onChangeTemplate} disabled={busy}>
          {t("desktop.create.changeTemplate.action")}
        </Button>
      }
      hint={t("desktop.create.enter.hint")}
      initialFocus={nameRef}
      actions={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("desktop.create.cancel.action")}
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t("desktop.create.submit.action")}
          </Button>
        </>
      }
    >
      <Field
        label={t("desktop.create.name.label")}
        error={nameError()}
        description={
          library.libraryRoot === "" || problem !== null ? undefined : (
            <T
              k="desktop.create.folder.hint"
              values={{ path: `${library.libraryRoot}/${name}` }}
              components={{ code: <UserText mono className={styles.path} /> }}
            />
          )
        }
      >
        <TextField
          ref={nameRef}
          value={name}
          onFocus={selectOnOpen}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setName(event.target.value);
            setRejected(null);
          }}
        />
      </Field>
      {library.libraryRootSynced === true ? (
        <p className={styles.synced} role="note" data-synced-warning="">
          <Icon name="warning" size={14} />
          {t("desktop.create.synced.hint")}
        </p>
      ) : null}
      <Field
        label={t("desktop.create.note.label")}
        optionalLabel={t("desktop.create.optional.label")}
      >
        <TextField
          value={note}
          placeholder={t("desktop.create.note.placeholder")}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setNote(event.target.value)}
        />
      </Field>
      <div className={styles.card}>
        <div className={styles.row}>
          <div className={styles.text}>
            <span className={styles.cardTitle}>
              {t("desktop.create.autoClean.label")}
              <span className={styles.optional}>
                {autoClean
                  ? t("desktop.create.optional.label")
                  : t("desktop.create.autoCleanOff.label")}
              </span>
            </span>
            <span className={styles.cardHint}>
              {autoClean
                ? t("desktop.create.autoCleanOn.hint")
                : t("desktop.create.autoCleanOff.hint")}
            </span>
          </div>
          <Switch
            label={t("desktop.create.autoClean.label")}
            checked={autoClean}
            onCheckedChange={setAutoClean}
          />
        </div>
        {autoClean ? (
          <div className={styles.details}>
            <div className={styles.row}>
              <span className={styles.grow}>{t("desktop.create.cleanAfter.label")}</span>
              <SegmentedControl
                label={t("desktop.create.cleanAfter.label")}
                items={presetItems}
                value={choice}
                onValueChange={setChoice}
              />
            </div>
            {choice === CUSTOM ? (
              <Field
                label={t("desktop.create.customDays.label")}
                error={customInvalid ? t("desktop.create.customDaysInvalid.hint") : undefined}
              >
                <TextField
                  inputMode="numeric"
                  value={customText}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setCustomText(event.target.value)
                  }
                />
              </Field>
            ) : null}
            {days === null ? null : (
              <span className={styles.cardHint}>
                {t("desktop.create.cleanSummary.hint", { days })}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
