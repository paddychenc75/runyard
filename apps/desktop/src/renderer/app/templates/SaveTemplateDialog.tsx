import { T, useT } from "@runyard/i18n/react";
import { Banner, Button, Dialog, Field, Switch, TextField, UserText } from "@runyard/ui";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { DesktopError, LibraryState } from "../../../shared/library-state.ts";
import type { SaveTemplatePlan } from "../../../shared/templates-view.ts";
import { pickLocalizedText } from "../../library-view.ts";
import { useOverlay } from "../../shared/overlay-context.tsx";
import { useErrorText } from "../use-error-text.ts";
import { buildPathTree } from "./path-tree.ts";
import styles from "./SaveTemplateDialog.module.css";
import { SaveTemplateTree } from "./SaveTemplateTree.tsx";
import { idProblem, initialId, saveRequestOf } from "./save-template-model.ts";
import { rangeParts, rangePartText, toolLabel } from "./templates-model.ts";

export interface SaveTemplateDialogProps {
  bridge: DesktopBridge;
  /** 要存成模板的项目 */
  project: { id: string; name: string };
  locale: LibraryState["locale"];
  onClose: () => void;
  /** 读不出弹窗要的数据（项目没了、文件夹找不到）：交给调用方写失败说明 */
  onUnavailable: (error: DesktopError) => void;
}

// 另存为模板弹窗（设计稿 SaveTemplate，规格 DESKTOP-TEMPLATES-VIEW-07 至 10）：先向主进程要文件树和已占用的标识，
// 数据到了才画弹窗。“把项目名替换成变量”默认开（负责人 2026-10-17 批准；命令行默认不变）。
export function SaveTemplateDialog(props: SaveTemplateDialogProps) {
  const { bridge, project, onUnavailable } = props;
  const [plan, setPlan] = useState<SaveTemplatePlan | null>(null);
  useEffect(() => {
    let live = true;
    void bridge.call("template.savePlan", project.id).then((result) => {
      if (!live) return;
      if (result.ok) setPlan(result.plan);
      else onUnavailable(result.error);
    });
    return () => {
      live = false;
    };
  }, [bridge, project.id, onUnavailable]);
  return plan === null ? null : <SaveForm {...props} plan={plan} />;
}

function SaveForm({
  bridge,
  project,
  locale,
  plan,
  onClose,
}: SaveTemplateDialogProps & { plan: SaveTemplatePlan }) {
  const t = useT();
  const errorText = useErrorText();
  // 预览是原生视图，会盖住网页里的浮层：打开期间告诉外壳，预览区据此换成截图
  useOverlay(true);
  const tree = useMemo(() => buildPathTree(plan.files), [plan.files]);
  const [name, setName] = useState(project.name);
  const [id, setId] = useState(() => initialId(project.name, plan.takenIds));
  const [description, setDescription] = useState("");
  const [replaceName, setReplaceName] = useState(true);
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(new Set());
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  const [rejected, setRejected] = useState<DesktopError | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // 管理进程回的“已被占用”“写法不对”也写在标识下面（界面的判断放过、它不认的情形）
  const problem =
    idProblem(id, plan.takenIds) ??
    (rejected?.code === "NAME_EXISTS"
      ? "taken"
      : rejected?.code === "NAME_INVALID"
        ? "invalid"
        : null);
  const otherFailure =
    rejected !== null && rejected.code !== "NAME_EXISTS" && rejected.code !== "NAME_INVALID"
      ? rejected
      : null;
  const canSave = id !== "" && problem === null && !busy;

  async function submit() {
    if (!canSave) return;
    setBusy(true);
    const result = await bridge.call(
      "template.save",
      saveRequestOf({
        playground: project.id,
        id,
        name,
        description,
        replaceName,
        tree,
        unchecked,
        included,
      }),
    );
    setBusy(false);
    if (result.ok) onClose();
    else setRejected(result.error);
  }

  const toggleIn = (set: ReadonlySet<string>, paths: readonly string[], on: boolean) => {
    const next = new Set(set);
    for (const path of paths) {
      if (on) next.add(path);
      else next.delete(path);
    }
    return next;
  };

  const original =
    plan.templateName === null
      ? null
      : {
          template: pickLocalizedText(plan.templateName, locale),
          requirements: plan.requires.map(
            (need) =>
              `${toolLabel(need.tool)} ${rangeParts(need.version)
                .map(rangePartText)
                .join(` ${t("desktop.templates.rangeAnd.label")} `)}`,
          ),
        };

  return (
    <Dialog
      open
      wide
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      onSubmit={() => void submit()}
      title={t("desktop.saveTemplate.title")}
      subtitle={t("desktop.saveTemplate.subtitle.body", { name: plan.projectName })}
      hint={t("desktop.saveTemplate.footer.hint", {
        path: id === "" ? plan.userDir : `${plan.userDir}/${id}`,
      })}
      initialFocus={nameRef}
      actions={
        <>
          <Button type="button" onClick={onClose} disabled={busy}>
            {t("desktop.saveTemplate.cancel.action")}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSave} loading={busy}>
            {t("desktop.saveTemplate.submit.action")}
          </Button>
        </>
      }
    >
      <Field label={t("desktop.saveTemplate.name.label")}>
        <TextField
          ref={nameRef}
          value={name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
        />
      </Field>
      <Field
        label={t("desktop.saveTemplate.id.label")}
        error={
          problem === "taken"
            ? t("desktop.saveTemplate.idTaken.hint")
            : problem === "invalid"
              ? t("desktop.saveTemplate.idInvalid.hint")
              : undefined
        }
        description={
          <T
            k="desktop.saveTemplate.id.hint"
            values={{
              command: `runyard new ${id === "" ? t("desktop.saveTemplate.idPlaceholder.label") : id}`,
            }}
            components={{ code: <UserText mono className={styles.code} /> }}
          />
        }
      >
        <TextField
          className={styles.mono}
          value={id}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setId(event.target.value);
            setRejected(null);
          }}
        />
      </Field>
      <Field label={t("desktop.saveTemplate.description.label")}>
        <TextField
          value={description}
          placeholder={t("desktop.saveTemplate.description.placeholder")}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDescription(event.target.value)}
        />
      </Field>
      <div className={styles.files}>
        <span className={styles.label}>{t("desktop.saveTemplate.files.label")}</span>
        <SaveTemplateTree
          nodes={tree}
          excluded={plan.excluded}
          unchecked={unchecked}
          included={included}
          onToggleFiles={(files, checked) => setUnchecked((set) => toggleIn(set, files, !checked))}
          onToggleExcluded={(path, checked) => setIncluded((set) => toggleIn(set, [path], checked))}
        />
      </div>
      {original === null || plan.requires.length === 0 ? null : (
        <p className={styles.requires}>
          <span className={styles.label}>{t("desktop.saveTemplate.requires.label")}</span>
          <span className={styles.requiresText}>
            {t("desktop.saveTemplate.requiresFrom.body", { template: original.template })}
            {original.requirements.map((text, index) => (
              <UserText key={text} className={styles.requirement}>
                {text}
                {index < original.requirements.length - 1
                  ? t("desktop.saveTemplate.listComma.label")
                  : null}
              </UserText>
            ))}
          </span>
        </p>
      )}
      <div className={styles.switchRow}>
        <Switch
          label={t("desktop.saveTemplate.replaceName.label")}
          checked={replaceName}
          onCheckedChange={setReplaceName}
        />
        <span>{t("desktop.saveTemplate.replaceName.label")}</span>
      </div>
      {otherFailure === null ? null : (
        <Banner
          tone="danger"
          title={errorText(otherFailure, "title")}
          description={errorText(otherFailure, "body")}
        />
      )}
    </Dialog>
  );
}
