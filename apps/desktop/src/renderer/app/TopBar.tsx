import type { Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import {
  Badge,
  Button,
  StatusMark,
  TabStrip,
  type TabStripItem,
  Tooltip,
  UserText,
} from "@runyard/ui";
import { useCallback, useRef, useState } from "react";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow, RunningRow, TabRow } from "../../shared/library-state.ts";
import { useFlushProject } from "../features/editor/EditorWorkspace.tsx";
import { useCommand } from "../shared/command-host.tsx";
import { useWindowWidth } from "../shared/viewport.ts";
import { NotificationCenter } from "./notifications/NotificationCenter.tsx";
import { PaneToggleButton } from "./PaneToggleButton.tsx";
import { RunBar } from "./RunBar.tsx";
import { RunningPopover } from "./RunningPopover.tsx";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  bridge: DesktopBridge;
  modKey: BootstrapInfo["modKey"];
  tabs: readonly TabRow[];
  /** "library" 或项目 id */
  activeTab: string;
  /** 正在运行的项目数：标签页持有的和命令行持有的都算 */
  running: number;
  /** 运行视图（点“N 个运行中”）列出的运行 */
  runs: readonly RunningRow[];
  /** 资源库里的全部项目：运行条的“更多”菜单用 */
  playgrounds: readonly PlaygroundRow[];
  /** 当前的项目标签；在资源库时是 undefined，不显示运行条 */
  activeTabRow: TabRow | undefined;
  /** “新建”：打开模板选择器（资源库标签是右端的蓝色按钮，项目标签是标签条末尾的“＋”） */
  onNew: () => void;
  /** 侧栏现在是不是显示着，和切换它的回调（项目标签页没有侧栏，不给就不画按钮） */
  sidebarVisible: boolean;
  onToggleSidebar?: () => void;
  onSelect: (id: string) => void;
  /** 关闭项目标签（关闭钮、⌘W）；要不要确认由主进程决定 */
  onClose: (id: string) => void;
}

/** 窗口窄于它：“N 个运行中”只留圆点和数字，运行条只留圆点和端口（规格 DESKTOP-LIBRARY-VIEW-67、DESKTOP-WORKSPACE-65） */
export const COMPACT_WINDOW_PX = 1200;

// 顶栏只列打开的项目标签，资源库由全局侧栏进入（DESKTOP-WORKSPACE-03）。
// 名字前是运行状态的小圆点。项目标签有关闭钮和 ⌘W（#174，
// 运行中的会先出确认对话框，见 CloseConfirmDialog）。右边是“N 个运行中”（无边框文字按钮，点开是运行视图
// RunningPopover，#186）；项目标签上它左边是运行条（#176），资源库标签上最右是“新建”（#173）。
// 搜索框不在顶栏，在资源库页的页头。侧栏收起后，侧栏按钮跟着红绿灯留在最左边。
export function TopBar({
  bridge,
  modKey,
  tabs,
  activeTab,
  running,
  runs,
  playgrounds,
  activeTabRow,
  onNew,
  sidebarVisible,
  onToggleSidebar,
  onSelect,
  onClose,
}: TopBarProps) {
  const t = useT();
  const format = useFormat();
  const flushProject = useFlushProject();
  const compact = useWindowWidth() < COMPACT_WINDOW_PX;
  const [listOpen, setListOpen] = useState(false);
  const closeList = useCallback(() => setListOpen(false), []);
  const runningRef = useRef<HTMLDivElement>(null);
  // 命令面板的“打开运行视图”：和点“N 个运行中”是同一个面板
  useCommand("app.openRunning", () => setListOpen(true));
  const items: TabStripItem[] = tabs.map(
    (tab): TabStripItem => ({
      id: tab.id,
      label: (
        <>
          <UserText>{tab.name}</UserText>
          {tab.attached !== null ? (
            <Badge variant="violet" className={styles.agent}>
              {tab.attached.agent === null ? (
                t("desktop.tab.cli.label")
              ) : (
                <UserText>{tab.attached.agent}</UserText>
              )}
            </Badge>
          ) : null}
        </>
      ),
      // 折进“+N”菜单时只有名字（用户起的项目名，原样显示）
      menuLabel: tab.name as Localized,
      status: tab.status,
      closeLabel: t("workspace.tab.close.label", { name: tab.name }),
      statusLabel:
        tab.state === "idle" ? t("desktop.state.idle.label") : t(`runState.${tab.state}`),
    }),
  );
  const runningText =
    running > 0
      ? t("library.topbar.running.label", { count: running })
      : t("library.topbar.idle.label");
  const runningButton = (
    <button
      type="button"
      className={styles.runningButton}
      data-running-toggle=""
      data-open={listOpen || undefined}
      aria-haspopup="dialog"
      aria-expanded={listOpen}
      aria-label={compact ? runningText : undefined}
      onClick={() => setListOpen((open) => !open)}
    >
      <StatusMark status={running > 0 ? "running" : "stopped"} />
      <span>{compact && running > 0 ? format.number(running) : runningText}</span>
    </button>
  );
  return (
    <div className={styles.root} data-window-toolbar="">
      {onToggleSidebar === undefined || sidebarVisible ? null : (
        <span className={styles.sidebarToggle}>
          <PaneToggleButton
            sidebar
            label={t("library.sidebar.expand.label")}
            expanded={false}
            onClick={onToggleSidebar}
          />
        </span>
      )}
      <TabStrip
        label={t("workspace.tabs.aria")}
        overflowLabel={t("workspace.tabs.more.aria")}
        items={items}
        value={activeTab}
        onValueChange={onSelect}
        onClose={(id) => void flushProject(id).then((proceed) => proceed && onClose(id))}
        modKey={modKey}
        add={
          activeTabRow === undefined
            ? undefined
            : { label: t("desktop.create.newProject.action"), onClick: onNew }
        }
      />
      {activeTabRow === undefined ? null : (
        <RunBar bridge={bridge} tab={activeTabRow} playgrounds={playgrounds} compact={compact} />
      )}
      {activeTabRow === undefined ? null : <span className={styles.divider} aria-hidden="true" />}
      <div className={styles.runningWrap} ref={runningRef}>
        {compact ? <Tooltip content={runningText}>{runningButton}</Tooltip> : runningButton}
        {listOpen && runningRef.current !== null ? (
          <RunningPopover
            bridge={bridge}
            runs={runs}
            anchor={runningRef.current.getBoundingClientRect()}
            onClose={closeList}
          />
        ) : null}
      </div>
      <NotificationCenter />
      <Button
        variant="primary"
        icon="plus"
        className={styles.new}
        onClick={onNew}
        data-reserved={activeTabRow === undefined ? undefined : ""}
        aria-hidden={activeTabRow === undefined ? undefined : true}
        tabIndex={activeTabRow === undefined ? undefined : -1}
      >
        {t("desktop.create.title")}
      </Button>
    </div>
  );
}
