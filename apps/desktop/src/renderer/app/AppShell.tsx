import { useT } from "@runyard/i18n/react";
import { useEffect } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { LibraryState } from "../../shared/library-state.ts";
import { runningCount } from "../library-view.ts";
import styles from "./AppShell.module.css";
import { LibraryPage } from "./LibraryPage.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { TopBar } from "./TopBar.tsx";

export interface AppShellProps {
  bridge: DesktopBridge;
  /** 第一次推送之前是 null */
  library: LibraryState | null;
}

// 主窗口的外壳（设计稿 Main）：悬浮的玻璃侧栏、顶部的标签条，右下是内容区。
// 内容区是资源库页；开发期的预览（原生视图）盖在它上面，标签页内容（#170）接手后换掉。
export function AppShell({ bridge, library }: AppShellProps) {
  const t = useT();
  const title = t("desktop.window.title");
  useEffect(() => {
    document.title = title;
  }, [title]);
  const { windowControls, modKey } = bridge.bootstrap;
  const total = library?.playgrounds.length ?? 0;
  return (
    <div className={styles.root}>
      <Sidebar windowControls={windowControls} total={total} />
      <TopBar bridge={bridge} modKey={modKey} running={runningCount(library?.playgrounds ?? [])} />
      <main className={styles.content}>
        <LibraryPage bridge={bridge} library={library} />
        <div className={styles.preview} data-preview-region="" />
      </main>
    </div>
  );
}
