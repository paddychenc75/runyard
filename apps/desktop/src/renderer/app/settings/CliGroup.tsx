import { useT } from "@runyard/i18n/react";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { SettingsGroup, SettingsNote, SettingsRow } from "./SettingsGroup.tsx";

// 命令行与智能体：这一期只有“内置模板免确认”（规格 DESKTOP-SETTINGS-25）；
// runyard 命令、诊断信息、管理进程、技能包随 #195，先用一行说明占位。
export function CliGroup({ api }: { api: SettingsApi }) {
  const t = useT();
  const { settings, update } = api;
  if (settings === null) return null;
  return (
    <SettingsGroup title={t("settings.cli.title")}>
      <SettingsNote>{t("settings.pending.cli.label")}</SettingsNote>
      <SettingsRow
        title={t("settings.builtinSkip.title")}
        hint={t("settings.builtinSkip.hint")}
        wrapHint
      >
        <SettingSwitch
          label={t("settings.builtinSkip.title")}
          checked={settings.urlNewSkipConfirmForBuiltin}
          onCheckedChange={(checked) => update({ urlNewSkipConfirmForBuiltin: checked })}
        />
      </SettingsRow>
    </SettingsGroup>
  );
}
