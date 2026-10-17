import { useT } from "@runyard/i18n/react";
import {
  Button,
  GlassSurface,
  StatusMark,
  TabStrip,
  type TabStripItem,
  UserText,
} from "@runyard/ui";
import type { RefObject } from "react";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { PlaygroundRow, TabRow } from "../../shared/library-state.ts";
import { useFlushProject } from "../features/editor/EditorWorkspace.tsx";
import { RunBar } from "./RunBar.tsx";
import { SearchBox } from "./SearchBox.tsx";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  bridge: DesktopBridge;
  modKey: BootstrapInfo["modKey"];
  tabs: readonly TabRow[];
  /** "library" 或项目 id */
  activeTab: string;
  /** 正在运行的项目数：标签页持有的和命令行持有的都算 */
  running: number;
  /** 资源库里的全部项目：运行条的“更多”菜单用 */
  playgrounds: readonly PlaygroundRow[];
  /** 当前的项目标签；在资源库时是 undefined，不显示运行条 */
  activeTabRow: TabRow | undefined;
  /** 顶栏右端的“新建”：打开模板选择器 */
  onNew: () => void;
  /** 搜索框的文字和焦点：只在资源库标签上显示（规格 DESKTOP-LIBRARY-VIEW-14） */
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onSelect: (id: string) => void;
  /** 关闭项目标签（关闭钮、⌘W）；要不要确认由主进程决定 */
  onClose: (id: string) => void;
}

// 顶栏：标签条里资源库固定在第一位、不能关闭（规格 desktop/workspace 的 DESKTOP-WORKSPACE-03），
// 后面是打开的项目标签，名字前是运行状态的小圆点。项目标签有关闭钮和 ⌘W（#174，
// 运行中的会先出确认对话框，见 CloseConfirmDialog）。右边是“N 个运行中”
// （点开运行视图随 #186）；当前标签是资源库时左边是搜索框（#181），是项目时多一条运行条（#176）；最右是“新建”（#173，打开模板选择器）。
export function TopBar({
  bridge,
  modKey,
  tabs,
  activeTab,
  running,
  playgrounds,
  activeTabRow,
  onNew,
  search,
  onSearchChange,
  searchRef,
  onSelect,
  onClose,
}: TopBarProps) {
  const t = useT();
  const flushProject = useFlushProject();
  const items: TabStripItem[] = [
    { id: "library", label: t("library.tab.title"), icon: "grid" },
    ...tabs.map(
      (tab): TabStripItem => ({
        id: tab.id,
        label: <UserText>{tab.name}</UserText>,
        status: tab.status,
        closeLabel: t("workspace.tab.close.label", { name: tab.name }),
        statusLabel:
          tab.state === "idle" ? t("desktop.state.idle.label") : t(`runState.${tab.state}`),
      }),
    ),
  ];
  return (
    <div className={styles.root}>
      <TabStrip
        label={t("workspace.tabs.aria")}
        items={items}
        value={activeTab}
        onValueChange={onSelect}
        onClose={(id) => void flushProject(id).then((proceed) => proceed && onClose(id))}
        modKey={modKey}
      />
      <div className={styles.spacer} />
      {activeTabRow === undefined ? (
        <SearchBox value={search} onValueChange={onSearchChange} inputRef={searchRef} />
      ) : (
        <RunBar bridge={bridge} tab={activeTabRow} playgrounds={playgrounds} />
      )}
      <GlassSurface material="toolbar" className={styles.running}>
        <StatusMark status={running > 0 ? "running" : "stopped"} />
        <span>
          {running > 0
            ? t("library.topbar.running.label", { count: running })
            : t("library.topbar.idle.label")}
        </span>
      </GlassSurface>
      <Button variant="primary" icon="plus" className={styles.new} onClick={onNew}>
        {t("desktop.create.title")}
      </Button>
    </div>
  );
}
