import { useT } from "@runyard/i18n/react";
import { Icon } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { stateLabelKey } from "../library-view.ts";
import styles from "./PreviewStopped.module.css";
import { RunActionButton } from "./RunActionButton.tsx";

export interface PreviewStoppedProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 预览区里项目没在运行时的画面（设计稿 Stopped）：灰色圆标、状态名、说明和“运行”按钮。
// 手动停止后标签页仍开着，点“运行”再次启动（规格 DESKTOP-WORKSPACE-11、12）。
export function PreviewStopped({ bridge, tab }: PreviewStoppedProps) {
  const t = useT();
  const manuallyStopped = tab.state === "stopped" || tab.state === "idle";
  return (
    <div className={styles.root} data-preview-stopped="">
      <span className={styles.badge}>
        <Icon name="stop" size={24} />
      </span>
      <h2 className={styles.title}>{t(stateLabelKey(tab.state))}</h2>
      {manuallyStopped ? <p className={styles.body}>{t("desktop.stopped.body")}</p> : null}
      <RunActionButton bridge={bridge} tab={tab} size="lg" />
    </div>
  );
}
