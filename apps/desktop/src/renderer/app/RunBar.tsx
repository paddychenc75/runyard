import type { Localized } from "@runyard/i18n";
import { useLocale, useT } from "@runyard/i18n/react";
import { Icon, IconButton, StatusMark, Tooltip } from "@runyard/ui";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow, TabRow } from "../../shared/library-state.ts";
import { pickLocalizedText } from "../library-view.ts";
import { useCommands } from "../shared/command-host.tsx";
import { RunActionButton } from "./RunActionButton.tsx";
import styles from "./RunBar.module.css";
import { RunBarMenu } from "./RunBarMenu.tsx";
import { isScript, runActionOf } from "./run-view.ts";
import { useRunStatus } from "./use-run-status.ts";

export interface RunBarProps {
  bridge: DesktopBridge;
  tab: TabRow;
  /** 资源库里的全部项目：“更多”菜单要这个项目的备注、保留状态和重名校验用的名称；不给就没有“更多”菜单 */
  playgrounds?: readonly PlaygroundRow[];
  /** 窗口窄：状态文字省掉，只留圆点和端口（规格 DESKTOP-WORKSPACE-65） */
  compact?: boolean;
}

// 运行条（设计稿 Service、Stopped、Script，2026-10-18 改为方案 A）：状态（圆点加文字，服务带端口，
// 脚本带退出码和耗时）、操作按钮、“更多”。没有项目名（选中的标签已经写了）；模板名和持有者说明
// （“关闭标签页即停止”“由命令行启动…”）在状态的悬停提示里，也在“更多”菜单最上面一行。
// 服务运行中是“重启”和“停止”（规格 DESKTOP-WORKSPACE-25）；重启、停止、更多只显示图标，没有边框。
export function RunBar({ bridge, tab, playgrounds, compact = false }: RunBarProps) {
  const t = useT();
  const locale = useLocale();
  const status = useRunStatus(tab);
  const row = playgrounds?.find((item) => item.id === tab.id);
  // 命令面板里的运行、停止运行、重启：与运行条上的按钮同一个判断，按钮不在命令就不在（规格 DESKTOP-EDITOR-61）
  const action = runActionOf(tab);
  const idle = !tab.busy;
  useCommands({
    "project.run":
      idle && action !== "stop" && tab.missing !== true
        ? () => void bridge.call("run.start", tab.id)
        : null,
    "project.stop": idle && action === "stop" ? () => void bridge.call("run.stop", tab.id) : null,
    "project.restart":
      idle && tab.active && !isScript(tab) ? () => void bridge.call("run.restart", tab.id) : null,
  });
  const template =
    tab.templateName === null ? null : (pickLocalizedText(tab.templateName, locale) as Localized);
  const hints: Localized[] = [];
  if (tab.active && tab.ownedByTab) hints.push(t("desktop.runbar.closeHint.label"));
  if (tab.attached !== null) hints.push(t("desktop.runbar.cliHint.label"));
  const lines = [...(template === null ? [] : [template]), ...hints];
  // “更多”菜单最上面一行：模板和说明合成一句（只有一样就只写那一样）
  const note =
    template !== null && hints.length > 0
      ? t("desktop.runbar.note.label", { template, hint: hints.join(" ") })
      : (lines[0] ?? null);
  // 窄窗口：服务运行中只留“:7101”，其余状态（出错、缺工具、脚本的退出码）的文字照旧
  const portOnly = compact && tab.port !== null && status.text.includes(`:${tab.port}`);
  const statusText = (portOnly ? `:${tab.port}` : status.text) as Localized;
  // 缺工具不是失败：警示色加三角图标，和设计稿 MissingLight 的“缺少 Go”一致
  const mark =
    action === "recheck" ? (
      <span className={styles.warning} data-run-status="missing">
        <Icon name="warning" size={16} />
        {statusText}
      </span>
    ) : (
      <StatusMark
        status={status.mark}
        className={styles.status}
        data-danger={status.danger || undefined}
        data-compact={portOnly || undefined}
      >
        {statusText}
      </StatusMark>
    );
  return (
    <fieldset className={styles.root} aria-label={t("desktop.runbar.aria")} data-run-bar={tab.id}>
      {lines.length === 0 ? (
        mark
      ) : (
        <Tooltip
          content={
            <span className={styles.tip}>
              {lines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </span>
          }
        >
          {mark}
        </Tooltip>
      )}
      {tab.active && !isScript(tab) ? (
        <Tooltip content={t("desktop.restart.action")}>
          <IconButton
            icon="refresh"
            size="sm"
            label={t("desktop.restart.action")}
            disabled={tab.busy}
            onClick={() => void bridge.call("run.restart", tab.id)}
          />
        </Tooltip>
      ) : null}
      {action === "stop" ? (
        <Tooltip content={t("desktop.stop.action")}>
          <IconButton
            icon="stop"
            size="sm"
            label={t("desktop.stop.action")}
            disabled={tab.busy}
            onClick={() => void bridge.call("run.stop", tab.id)}
          />
        </Tooltip>
      ) : (
        <RunActionButton bridge={bridge} tab={tab} size="sm" />
      )}
      {row === undefined || playgrounds === undefined ? null : (
        <RunBarMenu
          bridge={bridge}
          row={row}
          taken={playgrounds.map((item) => item.name)}
          note={note}
        />
      )}
    </fieldset>
  );
}
