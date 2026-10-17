import type { Localized } from "@runyard/i18n";
import { Field, TextField } from "@runyard/ui";
import { type KeyboardEvent, useState } from "react";
import styles from "./NetworkRow.module.css";
import { SettingsRow } from "./SettingsGroup.tsx";

export interface NetworkRowProps {
  title: Localized;
  hint: Localized;
  /** 沿用本机配置时的说明（输入框显示的是本机的值） */
  inheritedHint: Localized;
  placeholder: Localized;
  invalidText: Localized;
  /** 设置里单独指定的值；没有就是沿用本机配置 */
  value: string | undefined;
  /** 本机配置里的值（.npmrc）；没有就空着 */
  local: string | undefined;
  /** 地址合法吗；不合法行内提示，不保存 */
  isValid: (text: string) => boolean;
  /** 保存；undefined 是清空，恢复沿用本机配置 */
  onCommit: (value: string | undefined) => void;
}

// 镜像源和代理的一行（规格 DESKTOP-SETTINGS-12 至 14）：输入框改好后按回车或离开输入框就保存，没有“保存”按钮。
// 没单独指定时输入框显示本机配置的值，用淡色标出是沿用的；不合法的地址行内提示、不保存、输入框里的字保留。
export function NetworkRow({
  title,
  hint,
  inheritedHint,
  placeholder,
  invalidText,
  value,
  local,
  isValid,
  onCommit,
}: NetworkRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const shown = draft ?? value ?? local ?? "";
  const inherited = draft === null && value === undefined && local !== undefined;

  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    if (text === (value ?? local ?? "")) {
      setDraft(null);
      setInvalid(false);
    } else if (text === "") {
      onCommit(undefined);
      setDraft(null);
      setInvalid(false);
    } else if (isValid(text)) {
      onCommit(text);
      setDraft(null);
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") {
      setDraft(null);
      setInvalid(false);
    }
  };
  return (
    <SettingsRow title={title} hint={inherited ? inheritedHint : hint}>
      <Field
        label={title}
        hideLabel
        className={styles.field}
        {...(invalid ? { error: invalidText } : {})}
      >
        <TextField
          className={styles.input}
          value={shown}
          data-inherited={inherited ? "" : undefined}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
      </Field>
    </SettingsRow>
  );
}
