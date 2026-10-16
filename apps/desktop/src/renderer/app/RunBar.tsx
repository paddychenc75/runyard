import { useLocale, useT } from "@runyard/i18n/react";
import { GlassSurface, StatusMark, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { pickLocalizedText } from "../library-view.ts";
import { RunActionButton } from "./RunActionButton.tsx";
import styles from "./RunBar.module.css";
import { useRunStatus } from "./use-run-status.ts";

export interface RunBarProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 运行条（设计稿 Service、Stopped、Script）：悬浮在顶栏右侧的胶囊，项目名、模板、运行状态
// （服务带端口，脚本带退出码和耗时）、“关闭标签页即停止”的提示，最右是停止/运行按钮。
// 重启和“更多”菜单不在 #176 范围（见 PR 的“与设计稿的差异”）。
export function RunBar({ bridge, tab }: RunBarProps) {
  const t = useT();
  const locale = useLocale();
  const status = useRunStatus(tab);
  return (
    <GlassSurface
      material="toolbar"
      className={styles.root}
      role="group"
      aria-label={t("desktop.runbar.aria")}
      data-run-bar={tab.id}
    >
      <UserText className={styles.name}>{tab.name}</UserText>
      {tab.templateName === null ? null : (
        <span className={styles.template}>
          <UserText>{pickLocalizedText(tab.templateName, locale)}</UserText>
        </span>
      )}
      <StatusMark
        status={status.mark}
        className={styles.status}
        data-danger={status.danger || undefined}
      >
        {status.text}
      </StatusMark>
      {tab.active && tab.ownedByTab ? (
        <span className={styles.hint}>{t("desktop.runbar.closeHint.label")}</span>
      ) : null}
      <RunActionButton bridge={bridge} tab={tab} />
    </GlassSurface>
  );
}
