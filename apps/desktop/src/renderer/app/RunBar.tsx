import { useLocale, useT } from "@runyard/i18n/react";
import { Button, GlassSurface, StatusMark, UserText } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow, TabRow } from "../../shared/library-state.ts";
import { pickLocalizedText } from "../library-view.ts";
import { RunActionButton } from "./RunActionButton.tsx";
import styles from "./RunBar.module.css";
import { RunBarMenu } from "./RunBarMenu.tsx";
import { isScript } from "./run-view.ts";
import { useRunStatus } from "./use-run-status.ts";

export interface RunBarProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 资源库里的全部项目：“更多”菜单要这个项目的备注、保留状态和重名校验用的名称；不给就没有“更多”菜单 */
  playgrounds?: readonly PlaygroundRow[];
}

// 运行条（设计稿 Service、Stopped、Script）：悬浮在顶栏右侧的胶囊，项目名、模板、运行状态
// （服务带端口，脚本带退出码和耗时）、“关闭标签页即停止”的提示，最右是停止/运行按钮。
// 服务运行中是“重启”和“停止”（规格 DESKTOP-WORKSPACE-25），最右是“更多”菜单（#182）。
export function RunBar({ bridge, tab, playgrounds }: RunBarProps) {
  const t = useT();
  const locale = useLocale();
  const status = useRunStatus(tab);
  const row = playgrounds?.find((item) => item.id === tab.id);
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
      {tab.attached === null ? null : (
        <span className={styles.hint}>{t("desktop.runbar.cliHint.label")}</span>
      )}
      {tab.active && !isScript(tab) ? (
        <Button
          icon="refresh"
          disabled={tab.busy}
          onClick={() => void bridge.call("run.restart", tab.id)}
        >
          {t("desktop.restart.action")}
        </Button>
      ) : null}
      <RunActionButton bridge={bridge} tab={tab} />
      {row === undefined || playgrounds === undefined ? null : (
        <RunBarMenu bridge={bridge} row={row} taken={playgrounds.map((item) => item.name)} />
      )}
    </GlassSurface>
  );
}
