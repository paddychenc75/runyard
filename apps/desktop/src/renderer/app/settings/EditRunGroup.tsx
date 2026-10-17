import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
import type { SettingsApi } from "../../bridge/use-settings.ts";
import { Segments } from "./Segments.tsx";
import { SettingSwitch } from "./SettingSwitch.tsx";
import { SettingsGroup, SettingsNote, SettingsRow } from "./SettingsGroup.tsx";

/** 空闲停止的三档（分钟）；设置里是别的整数（命令行改过）时不选中任何一档 */
const IDLE_CHOICES = [15, 30, 120] as const;

// 编辑与运行（规格 DESKTOP-SETTINGS-08 至 11）：自动保存三档、脚本保存后自动运行、关闭确认、空闲停止。
export function EditRunGroup({ api }: { api: SettingsApi }) {
  const t = useT();
  const { settings, update } = api;
  if (settings === null) return null;
  const idle = String(settings.cliIdleStopMinutes);
  return (
    <SettingsGroup title={t("settings.editRun.title")}>
      <SettingsRow title={t("settings.autoSave.title")} hint={t("settings.autoSave.hint")}>
        <Segments
          label={t("settings.autoSave.title")}
          value={settings.autoSave}
          onValueChange={(next) =>
            update({ autoSave: next === "blur" ? "blur" : next === "off" ? "off" : "delay" })
          }
          items={[
            { value: "delay", label: t("settings.autoSave.delay.label") },
            { value: "blur", label: t("settings.autoSave.blur.label") },
            { value: "off", label: t("settings.autoSave.off.label") },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.scriptAutoRun.title")}
        hint={t("settings.scriptAutoRun.hint")}
      >
        <SettingSwitch
          label={t("settings.scriptAutoRun.title")}
          checked={settings.scriptAutoRun}
          onCheckedChange={(checked) => update({ scriptAutoRun: checked })}
        />
      </SettingsRow>
      <SettingsRow
        title={t("settings.confirmClose.title")}
        hint={t("settings.confirmClose.hint")}
        wrapHint
      >
        <SettingSwitch
          label={t("settings.confirmClose.title")}
          checked={settings.confirmCloseRunningTab}
          onCheckedChange={(checked) => update({ confirmCloseRunningTab: checked })}
        />
      </SettingsRow>
      <SettingsRow title={t("settings.idleStop.title")} hint={t("settings.idleStop.hint")} wrapHint>
        <Segments
          label={t("settings.idleStop.title")}
          value={idle}
          onValueChange={(next) => {
            const minutes = Number(next);
            if (IDLE_CHOICES.some((choice) => choice === minutes)) {
              update({ cliIdleStopMinutes: minutes });
            }
          }}
          items={[
            { value: "15", label: t("settings.idleStop.min15.label") },
            { value: "30", label: t("settings.idleStop.min30.label") },
            { value: "120", label: t("settings.idleStop.hour2.label") },
          ]}
        />
      </SettingsRow>
      <SettingsNote icon={<Icon name="info" size={14} />}>
        {t("settings.runNote.label")}
      </SettingsNote>
    </SettingsGroup>
  );
}
