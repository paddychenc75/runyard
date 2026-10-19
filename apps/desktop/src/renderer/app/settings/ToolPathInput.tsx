import { useT } from "@runyard/i18n/react";
import type { ToolchainReport } from "@runyard/protocol";
import { Field, TextField } from "@runyard/ui";
import { useId } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import { ToolPathActions } from "./ToolPathActions.tsx";
import styles from "./ToolPathInput.module.css";
import { toolName } from "./tool-view.ts";
import { useToolPathInput } from "./use-tool-path-input.ts";

export function focusToolPath(tool: string): void {
  document.getElementById(`tool-path-${tool}`)?.focus();
}

/** 草稿独立于检测结果；保存回包只清除发出时的草稿，不覆盖用户后续输入。 */
export function ToolPathInput({
  bridge,
  tool,
  path,
  onApply,
}: {
  bridge: DesktopBridge;
  tool: string;
  path: string | undefined;
  onApply: (report: ToolchainReport) => void;
}) {
  const t = useT();
  const { value, problem, busy, run, edit } = useToolPathInput(bridge, tool, path, onApply);
  const hintId = useId();
  const message =
    problem === "absolute"
      ? t("settings.runtime.absolutePath.body")
      : problem === "invalid"
        ? t("settings.runtime.invalidPath.body", { tool: toolName(tool) })
        : problem === "failed"
          ? t("settings.runtime.pathFailed.body")
          : null;
  return (
    <Field
      label={t("settings.runtime.pathInput.aria", { tool: toolName(tool) })}
      hideLabel
      className={styles.field}
    >
      <div className={styles.controls}>
        <TextField
          id={`tool-path-${tool}`}
          className={styles.input}
          value={value}
          placeholder={t("settings.runtime.pathInput.placeholder")}
          aria-describedby={hintId}
          aria-invalid={problem !== null}
          aria-busy={busy}
          onChange={(event) => edit(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              void run(false);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              edit(null);
            }
          }}
        />
        <ToolPathActions
          tool={tool}
          dirty={value !== (path ?? "")}
          busy={busy}
          onSave={() => void run(false)}
          onCancel={() => edit(null)}
          onChoose={() => void run(true)}
        />
      </div>
      <p
        id={hintId}
        className={message === null ? styles.hint : styles.problem}
        role={message === null ? undefined : "alert"}
      >
        {message ?? t("settings.runtime.pathInput.hint")}
      </p>
    </Field>
  );
}
