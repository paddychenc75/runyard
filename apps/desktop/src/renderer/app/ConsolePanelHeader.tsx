import { useT } from "@runyard/i18n/react";
import { Button, SegmentedControl } from "@runyard/ui";
import type { PanelMode } from "../features/terminal/panel-mode.ts";
import styles from "./ConsolePanel.module.css";

export function ConsolePanelHeader({
  script,
  mode,
  onModeChange,
  onClear,
  onOpenTerminal,
}: {
  script: boolean;
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onClear: () => void;
  /** 脚本的终端还没打开时给出，标题条上显示“打开终端”（问题单 R2） */
  onOpenTerminal?: (() => void) | undefined;
}) {
  const t = useT();
  return (
    <header
      className={styles.header}
      data-collapsed={onOpenTerminal === undefined ? undefined : ""}
    >
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
      {onOpenTerminal !== undefined ? (
        <Button size="sm" onClick={onOpenTerminal}>
          {t("desktop.console.terminalOpen.action")}
        </Button>
      ) : !script && mode === "output" ? (
        <Button size="sm" onClick={onClear}>
          {t("desktop.console.clear.action")}
        </Button>
      ) : null}
    </header>
  );
}
