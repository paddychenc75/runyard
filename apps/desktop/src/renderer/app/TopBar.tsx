import { useT } from "@runyard/i18n/react";
import { GlassSurface, StatusMark, TabStrip, type TabStripItem } from "@runyard/ui";
import type { MouseEvent } from "react";
import type { BootstrapInfo, DesktopBridge } from "../../shared/desktop-bridge.ts";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  bridge: DesktopBridge;
  modKey: BootstrapInfo["modKey"];
  /** 正在运行的项目数：标签页持有的和命令行持有的都算 */
  running: number;
}

// 顶栏：只有资源库页有（PRD #prd-library-list）。标签条里资源库固定在第一位、不能关闭
// （规格 desktop/workspace 的 DESKTOP-WORKSPACE-03）；打开项目的标签随 #170 加进 items。
// 右边现在有“N 个运行中”（点开运行视图随 #186）；搜索、新建随各自的功能（#181、#173）。
export function TopBar({ bridge, modKey, running }: TopBarProps) {
  const t = useT();
  const items: TabStripItem[] = [{ id: "library", label: t("library.tab.title"), icon: "grid" }];
  // 开发期的预览盖住整个内容区：点资源库标签就是回到列表
  const backToLibrary = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest('[role="tab"]') !== null)
      void bridge.call("preview.select", null);
  };
  return (
    <div className={styles.root}>
      <TabStrip
        label={t("workspace.tabs.aria")}
        items={items}
        value="library"
        modKey={modKey}
        onClick={backToLibrary}
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
