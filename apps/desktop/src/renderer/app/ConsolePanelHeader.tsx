import { useT } from "@runyard/i18n/react";
import { Button, SegmentedControl } from "@runyard/ui";
import type { PanelMode } from "../features/terminal/panel-mode.ts";
import styles from "./ConsolePanel.module.css";

export function ConsolePanelHeader({
  script,
  mode,
  onModeChange,
  onClear,
}: {
  script: boolean;
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onClear: () => void;
}) {
  const t = useT();
  return (
    <header className={styles.header}>
      {script ? (
        <span className={styles.title}>{t("desktop.console.terminal.label")}</span>
      ) : (
        <SegmentedControl
          label={t("desktop.console.tabs.aria")}
          items={[
            { value: "output", label: t("desktop.console.tab.label") },
            { value: "terminal", label: t("desktop.console.terminal.label") },
          ]}
          value={mode}
          onValueChange={(next) => onModeChange(next === "terminal" ? "terminal" : "output")}
        />
      )}
      {!script && mode === "output" ? (
        <Button size="sm" onClick={onClear}>
          {t("desktop.console.clear.action")}
        </Button>
      ) : null}
    </header>
  );
}
