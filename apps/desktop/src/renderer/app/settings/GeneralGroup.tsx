import { useT } from "@runyard/i18n/react";

import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../../shared/library-state.ts";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { ExternalEditorRow } from "./ExternalEditorRow.tsx";
import { LibraryRootRow } from "./LibraryRootRow.tsx";
import { Segments } from "./Segments.tsx";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { SettingsGroup, SettingsRow } from "./SettingsGroup.tsx";

export interface GeneralGroupProps {
  bridge: DesktopBridge;
  api: SettingsApi;
  library: LibraryState | null;
}

// 通用（规格 DESKTOP-SETTINGS-03 至 07）：资源库位置、外部编辑器、语言、主题、自动检查更新。
export function GeneralGroup({ bridge, api, library }: GeneralGroupProps) {
  const t = useT();
  const { settings, update } = api;
  if (settings === null) return null;
  const language = settings.language ?? bridge.bootstrap.locale;
  return (
    <SettingsGroup title={t("settings.general.title")}>
      <LibraryRootRow bridge={bridge} display={library?.libraryRoot ?? ""} update={update} />
      <ExternalEditorRow bridge={bridge} value={settings.externalEditor} update={update} />
      <SettingsRow title={t("settings.language.title")} hint={t("settings.language.hint")}>
        <Segments
          label={t("settings.language.title")}
          value={language}
          onValueChange={(next) => update({ language: next === "en" ? "en" : "zh-CN" })}
          items={[
            { value: "en", label: t("settings.language.en.label") },
            { value: "zh-CN", label: t("settings.language.zhCN.label") },
          ]}
        />
      </SettingsRow>
      <SettingsRow title={t("settings.theme.title")} hint={t("settings.theme.hint")}>
        <Segments
          label={t("settings.theme.title")}
          value={settings.theme}
          onValueChange={(next) =>
            update({ theme: next === "light" ? "light" : next === "dark" ? "dark" : "system" })
          }
          items={[
            { value: "system", label: t("settings.theme.system.label") },
            { value: "light", label: t("settings.theme.light.label") },
            { value: "dark", label: t("settings.theme.dark.label") },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.updateCheck.title")}
        hint={t("settings.updateCheck.hint")}
        wrapHint
      >
        <SettingSwitch
          label={t("settings.updateCheck.title")}
          checked={settings.updateCheck}
          onCheckedChange={(checked) => update({ updateCheck: checked })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
