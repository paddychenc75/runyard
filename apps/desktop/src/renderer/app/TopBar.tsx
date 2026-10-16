import { useT } from "@runyard/i18n/react";
import { TabStrip, type TabStripItem } from "@runyard/ui";
import type { BootstrapInfo } from "../../shared/desktop-bridge.ts";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  modKey: BootstrapInfo["modKey"];
}

// 顶栏：只有资源库页有（PRD #prd-library-list）。标签条里资源库固定在第一位、不能关闭
// （规格 desktop/workspace 的 DESKTOP-WORKSPACE-03）；打开项目的标签随 #170 加进 items。
// 搜索、“N 个运行中”、新建三样随各自的功能（#169、#170、#175）加到右边。
export function TopBar({ modKey }: TopBarProps) {
  const t = useT();
  const items: TabStripItem[] = [{ id: "library", label: t("library.tab.title"), icon: "grid" }];
  return (
    <div className={styles.root}>
      <TabStrip label={t("workspace.tabs.aria")} items={items} value="library" modKey={modKey} />
    </div>
  );
}
