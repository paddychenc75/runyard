import { useT } from "@runyard/i18n/react";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { OverlayContext } from "../shared/overlay-context.tsx";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import styles from "./AppShell.module.css";
import { DevLibraryPanel } from "./DevLibraryPanel.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TabContent } from "./TabContent.tsx";
import { TopBar } from "./TopBar.tsx";

export interface AppShellProps {
  bridge: DesktopBridge;
  /** 第一次推送之前是 null */
  library: LibraryState | null;
}

// 主窗口的外壳（设计稿 Main）：悬浮的玻璃侧栏、顶部的标签条，右下是内容区。
// 内容区：资源库标签放开发期的朴素列表（DevLibraryPanel，等资源库列表替换）；项目标签是信息栏加预览区。
export function AppShell({ bridge, library }: AppShellProps) {
  const t = useT();
  const [overlays] = useState(() => new OverlayCounter());
  const title = t("desktop.window.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
  const { windowControls, modKey } = bridge.bootstrap;
  const tabs = library?.tabs ?? [];
  const activeTab = library?.activeTab ?? "library";
  const activeTabRow = tabs.find((tab) => tab.id === activeTab);
  const total = library?.playgrounds.length ?? 0;
  return (
    <OverlayContext.Provider value={overlays}>
      <div className={styles.root}>
        <Sidebar windowControls={windowControls} total={total} />
        <TopBar
          modKey={modKey}
          tabs={tabs}
          activeTab={activeTab}
          onSelect={(id) => void bridge.call("tab.select", id)}
        />
        <main className={styles.content}>
          {activeTabRow === undefined ? (
            <DevLibraryPanel bridge={bridge} library={library} />
          ) : (
            <>
              <TabContent bridge={bridge} tab={activeTabRow} />
              <PreviewPane bridge={bridge} tab={activeTabRow} overlays={overlays} />
            </>
          )}
        </main>
      </div>
    </OverlayContext.Provider>
  );
}
