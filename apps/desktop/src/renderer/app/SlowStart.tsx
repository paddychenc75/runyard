import { useT } from "@runyard/i18n/react";
import { Button, ButtonGroup, Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./FailureScreen.module.css";
import { focusConsoleOutput } from "./failure-view.ts";

export interface SlowStartProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 启动超过 30 秒仍未就绪（规格 DESKTOP-WORKSPACE-20）：不算失败，状态保持“启动中（较慢）”，
// 进程还活着、日志还在控制台里滚动；操作是“停止”和“查看输出”。
export function SlowStart({ bridge, tab }: SlowStartProps) {
  const t = useT();
  return (
    <div className={styles.root} data-failure-screen="slow">
      <div className={styles.head}>
        <span aria-hidden="true" className={styles.tile}>
          <Icon name="clock" size={20} />
        </span>
        <div className={styles.heading}>
          <h2 className={styles.title}>{t("desktop.slow.title")}</h2>
          <p className={styles.description}>{t("desktop.slow.body")}</p>
        </div>
      </div>
      <ButtonGroup size="md" className={styles.actions}>
        <Button
          icon="stop"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.stop", tab.id)}
        >
          {t("desktop.stop.action")}
        </Button>
        <Button onClick={focusConsoleOutput}>{t("desktop.output.view.action")}</Button>
      </ButtonGroup>
    </div>
  );
}
