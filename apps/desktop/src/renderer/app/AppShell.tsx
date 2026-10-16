import { useT } from "@runyard/i18n/react";
import { useEffect, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { runningCount } from "../library-view.ts";
import { OverlayContext } from "../shared/overlay-context.tsx";
import { OverlayCounter } from "../shared/overlay-counter.ts";
import styles from "./AppShell.module.css";
import { ConsolePanel } from "./ConsolePanel.tsx";
import { LibraryPage } from "./LibraryPage.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { isScript } from "./run-view.ts";
import { ScriptOutput } from "./ScriptOutput.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TabContent } from "./TabContent.tsx";
import { TopBar } from "./TopBar.tsx";

export interface AppShellProps {
  bridge: DesktopBridge;
  /** 第一次推送之前是 null */
  library: LibraryState | null;
}

// 主窗口的外壳（设计稿 Main）：悬浮的玻璃侧栏、顶部的标签条，右下是内容区。
// 资源库标签的内容区是资源库页（整宽的项目表）；项目标签上面是 TabContent 加右边的预览（原生视图）
// 或脚本输出，下面是控制台（脚本的输出就在右边，不再另开）。
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
          bridge={bridge}
          modKey={modKey}
          tabs={tabs}
          activeTab={activeTab}
          running={runningCount(library?.playgrounds ?? [])}
          activeTabRow={activeTabRow}
          onSelect={(id) => void bridge.call("tab.select", id)}
        />
        <main className={styles.content}>
          {activeTabRow === undefined ? (
            <LibraryPage bridge={bridge} library={library} />
          ) : (
            <div className={styles.workspace}>
              <div className={styles.top}>
                <TabContent tab={activeTabRow} />
                {isScript(activeTabRow) ? (
                  <ScriptOutput bridge={bridge} tab={activeTabRow} />
                ) : (
                  <PreviewPane bridge={bridge} tab={activeTabRow} overlays={overlays} />
                )}
              </div>
              {isScript(activeTabRow) ? null : <ConsolePanel bridge={bridge} tab={activeTabRow} />}
            </div>
          )}
        </main>
      </div>
    </OverlayContext.Provider>
  );
}
