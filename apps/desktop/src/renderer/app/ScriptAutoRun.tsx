import { useT } from "@runyard/i18n/react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./ScriptOutput.module.css";
import { SettingSwitch } from "./settings/SettingSwitch.tsx";

export interface ScriptAutoRunProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 设置里全局的“脚本保存后自动运行” */
  globalOn: boolean;
}

// “保存后自动运行”开关（规格 DESKTOP-WORKSPACE-34；全局关时见 DESKTOP-SETTINGS-09）：
// 显示并修改这个项目自己的值；全局设置关掉时一律显示为关、不可点，旁边说明是全局设置关的。
export function ScriptAutoRun({ bridge, tab, globalOn }: ScriptAutoRunProps) {
  const t = useT();
  return (
    <div className={styles.autoRun} data-script-autorun={globalOn ? "on" : "global-off"}>
      <SettingSwitch
        label={t("desktop.script.autoRun.label")}
        checked={globalOn && tab.scriptAutoRun}
        disabled={!globalOn}
        onCheckedChange={(enabled) =>
          void bridge.call("playground.scriptAutoRun", { id: tab.id, enabled })
        }
      />
      <span>{t("desktop.script.autoRun.label")}</span>
      {globalOn ? null : (
        <span className={styles.autoRunHint}>{t("desktop.script.autoRunGlobalOff.hint")}</span>
      )}
    </div>
  );
}
