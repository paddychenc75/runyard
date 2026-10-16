import { useT } from "@runyard/i18n/react";
import { GlassSurface, StatusMark, TabStrip, type TabStripItem, UserText } from "@runyard/ui";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  modKey: BootstrapInfo["modKey"];
  tabs: readonly TabRow[];
  /** "library" 或项目 id */
  activeTab: string;
  /** 正在运行的项目数：标签页持有的和命令行持有的都算 */
  running: number;
  onSelect: (id: string) => void;
}

// 顶栏：标签条里资源库固定在第一位、不能关闭（规格 desktop/workspace 的 DESKTOP-WORKSPACE-03），
// 后面是打开的项目标签，名字前是运行状态的小圆点。项目标签的关闭钮、确认对话框随 #174
// （给项目标签加 closeLabel 和 onClose 即可，TabStrip 已支持）。右边是“N 个运行中”
// （点开运行视图随 #186）；搜索、新建随 #181、#173。
export function TopBar({ modKey, tabs, activeTab, running, onSelect }: TopBarProps) {
  const t = useT();
  const items: TabStripItem[] = [
    { id: "library", label: t("library.tab.title"), icon: "grid" },
    ...tabs.map(
      (tab): TabStripItem => ({
        id: tab.id,
        label: <UserText>{tab.name}</UserText>,
        status: tab.status,
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
        modKey={modKey}
      />
      <div className={styles.spacer} />
      <GlassSurface material="toolbar" className={styles.running}>
        <StatusMark status={running > 0 ? "running" : "stopped"} />
        <span>
          {running > 0
            ? t("library.topbar.running.label", { count: running })
            : t("library.topbar.idle.label")}
        </span>
      </GlassSurface>
    </div>
  );
}
