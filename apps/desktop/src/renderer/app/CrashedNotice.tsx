import { useFormat, useT } from "@runyard/i18n/react";
import { Button, Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { ConsoleOutput } from "./ConsoleOutput.tsx";
import styles from "./FailureScreen.module.css";
import { focusConsoleOutput } from "./failure-view.ts";

export interface CrashedNoticeProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

const TAIL_LINES = 10;

// 运行中崩溃的提示（设计稿 Crashed，规格 DESKTOP-WORKSPACE-21）：盖在预览最后一帧上，
// 写明退出原因（退出码），最后几行日志，操作是“重新运行”和“查看完整输出”。
export function CrashedNotice({ bridge, tab }: CrashedNoticeProps) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div
      className={styles.root}
      role="alert"
      aria-label={t("desktop.crashed.overlay.aria")}
      data-failure-screen="crashed"
    >
      <div className={styles.head}>
        <span aria-hidden="true" className={styles.tile} data-tone="danger">
          <Icon name="exclamation" size={20} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title} data-tone="danger">
            {tab.exitCode === null
              ? t("runState.crashed")
              : t("desktop.crashed.title", { exitCode: fmt.number(tab.exitCode) })}
          </h2>
          <p className={styles.description}>{t("desktop.crashed.log.label")}</p>
        </div>
      </div>
      <ConsoleOutput bridge={bridge} playground={tab.id} className={styles.log} tail={TAIL_LINES} />
      <div className={styles.actions}>
        <Button
          variant="primary"
          icon="refresh"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.start", tab.id)}
        >
          {t("desktop.rerun.action")}
        </Button>
        <Button onClick={focusConsoleOutput}>{t("desktop.output.view.action")}</Button>
      </div>
    </div>
  );
}
