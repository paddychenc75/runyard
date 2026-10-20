import { useT } from "@runyard/i18n/react";
import { ButtonGroup, IconButton, SegmentedControl, Tooltip } from "@runyard/ui";
import type { TabRow } from "../../../shared/library-state.ts";
import { SettingSwitch } from "../settings/SettingSwitch.tsx";
import styles from "./RequestPanel.module.css";
import type { RequestPanelState } from "./use-request-panel.ts";

export function RequestToolbar({
  panel,
  tab,
  canSend,
  requestTab,
  setRequestTab,
}: {
  panel: RequestPanelState;
  tab: TabRow;
  canSend: boolean;
  requestTab: string;
  setRequestTab: (value: string) => void;
}) {
  const t = useT();
  const { draft } = panel;
  return (
    <div className={styles.toolRow} data-request-tools="">
      <SegmentedControl
        label={t("desktop.request.tabs.aria")}
        value={requestTab}
        onValueChange={setRequestTab}
        items={[
          { value: "headers", label: t("desktop.request.headers.label") },
          { value: "payload", label: t("desktop.request.payload.label") },
        ]}
      />
      <span className={styles.spacer} />
      <span className={styles.autoResend}>
        <SettingSwitch
          label={t("desktop.request.autoResend.label")}
          checked={panel.autoResend}
          onCheckedChange={panel.setAutoResend}
        />
        <Tooltip content={t("desktop.request.autoResend.label")}>
          <span className={styles.autoLabel}>{t("desktop.request.autoResend.label")}</span>
        </Tooltip>
      </span>
      <ButtonGroup size="sm" className={styles.tools}>
        <Tooltip
          content={
            panel.copied ? t("desktop.request.copied.label") : t("desktop.request.copyCurl.action")
          }
        >
          <IconButton
            icon={panel.copied ? "check" : "copy"}
            size="sm"
            label={
              panel.copied
                ? t("desktop.request.copied.label")
                : t("desktop.request.copyCurl.action")
            }
            disabled={tab.port === null}
            onClick={panel.copyCurl}
          />
        </Tooltip>
        <Tooltip content={t("desktop.request.openInBrowser.action")}>
          <IconButton
            icon="browser"
            size="sm"
            label={t("desktop.request.openInBrowser.action")}
            disabled={!canSend || draft.method !== "GET"}
            onClick={panel.openInBrowser}
          />
        </Tooltip>
      </ButtonGroup>
    </div>
  );
}
