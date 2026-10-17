import { useT } from "@runyard/i18n/react";
import type { SettingsPatch } from "@runyard/protocol";
import { Button, Icon, Menu } from "@runyard/ui";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { ExternalEditorOption } from "../../../shared/settings-bridge.ts";
import styles from "./ExternalEditorRow.module.css";
import { SettingsRow } from "./SettingsGroup.tsx";

export interface ExternalEditorRowProps {
  bridge: DesktopBridge;
  /** 设置里选的编辑器；没选过是 undefined（按本机找到的第一款） */
  value: string | undefined;
  update: (patch: SettingsPatch) => void;
}

// 外部编辑器（规格 DESKTOP-SETTINGS-07）：下拉里列本机找到的编辑器；一款也没找到时写“系统默认”。
export function ExternalEditorRow({ bridge, value, update }: ExternalEditorRowProps) {
  const t = useT();
  const [editors, setEditors] = useState<ExternalEditorOption[] | null>(null);
  useEffect(() => {
    let alive = true;
    void bridge.call("settings.editors").then(
      (found) => alive && setEditors(found),
      () => alive && setEditors([]),
    );
    return () => {
      alive = false;
    };
  }, [bridge]);
  const nameOf = (id: string) => {
    switch (id) {
      case "vscode":
        return t("settings.editor.vscode.label");
      case "cursor":
        return t("settings.editor.cursor.label");
      case "zed":
        return t("settings.editor.zed.label");
      case "sublime":
        return t("settings.editor.sublime.label");
      case "webstorm":
        return t("settings.editor.webstorm.label");
      default:
        return t("settings.editor.default.label");
    }
  };
  const currentId = editors === null ? undefined : (value ?? editors[0]?.id);
  return (
    <SettingsRow title={t("settings.editor.title")} hint={t("settings.editor.hint")}>
      <Menu
        label={t("settings.editor.title")}
        entries={(editors ?? []).map((editor) => ({ id: editor.id, label: nameOf(editor.id) }))}
        onSelect={(id) => update({ externalEditor: id })}
        trigger={
          <Button
            aria-label={t("settings.editor.title")}
            disabled={editors === null || editors.length === 0}
          >
            <span className={styles.trigger}>
              <span>
                {currentId === undefined ? t("settings.editor.default.label") : nameOf(currentId)}
              </span>
              <Icon name="chevron-down" size={10} />
            </span>
          </Button>
        }
      />
    </SettingsRow>
  );
}
