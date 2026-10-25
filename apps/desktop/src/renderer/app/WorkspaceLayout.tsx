import { useT } from "@runyard/i18n/react";
import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { layoutPanes } from "../../shared/pane-sizes.ts";
import { usePanelMode } from "../features/terminal/panel-mode.ts";
import type { LayoutPrefs } from "../shared/layout-prefs.ts";
import type { OverlayCounter } from "../shared/overlay-counter.ts";
import { ConsolePanel } from "./ConsolePanel.tsx";
import { previewScreenOf } from "./failure-view.ts";
import { MissingToolPane } from "./MissingToolPane.tsx";
import { PaneToggleButton } from "./PaneToggleButton.tsx";
import { PreviewPane } from "./PreviewPane.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { RequestPanel } from "./request/RequestPanel.tsx";
import { isScript } from "./run-view.ts";
import { ScriptOutput } from "./ScriptOutput.tsx";
import { TabContent } from "./TabContent.tsx";
import styles from "./WorkspaceLayout.module.css";

export interface WorkspaceLayoutProps {
  bridge: DesktopBridge;
  tab: TabRow;
  overlays: OverlayCounter;
  prefs: LayoutPrefs;
  onPrefs: (patch: Partial<LayoutPrefs>) => void;
}

// 量不到容器（第一次画之前、测试环境）时按这个大小算
const FALLBACK = { width: 1200, height: 700 };

// 项目标签页的版面（设计稿 WebLight、Script、Service）：上面一行是文件树、编辑器、预览（脚本是输出），
// 下面是控制台；它们之间的分隔条可以拖（规格 DESKTOP-WORKSPACE-55 至 61）。尺寸的范围和夹紧在
// shared/pane-sizes.ts，这里只量容器、把结果写成 CSS 变量。原生预览视图跟着预览占位区走：
// 占位区每变一次，PreviewSlot 就把新位置报给主进程，所以这里不用管视图。
export function WorkspaceLayout({ bridge, tab, overlays, prefs, onPrefs }: WorkspaceLayoutProps) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState(FALLBACK);
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setBox((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const script = isScript(tab);
  // 脚本没开终端时底部面板只有一行标题条，没有可拖的高度（问题单 R2）
  const panelMode = usePanelMode(tab.id);
  const consoleCollapsed = script && panelMode !== "terminal";
  const { sizes, ranges, treeCollapsed, previewHidden, treeHidden } = layoutPanes(box, prefs, true);
  const vars = {
    "--layout-file-tree-width": `${sizes.tree}px`,
    "--layout-console-height": `${sizes.console}px`,
    "--pane-preview-width": `${sizes.preview}px`,
  } as CSSProperties;
  return (
    <div className={styles.root}>
      <div ref={root} className={styles.inner} style={vars}>
        <TabContent
          key={tab.id}
          bridge={bridge}
          tab={tab}
          hideTree={treeHidden}
          onCollapseTree={() => onPrefs({ treeCollapsed: true })}
          collapsedRail={
            treeCollapsed ? (
              <div className={styles.rail}>
                <PaneToggleButton
                  label={t("workspace.files.expand.label")}
                  expanded={false}
                  onClick={() => onPrefs({ treeCollapsed: false })}
                />
              </div>
            ) : undefined
          }
          treeHandle={
            <ResizeHandle
              orientation="vertical"
              label={t("workspace.resize.tree.label")}
              value={sizes.tree}
              range={ranges.tree}
              growsTowardEnd
              onResize={(treeWidth) => onPrefs({ treeWidth })}
              onReset={() => onPrefs({ treeWidth: null })}
            />
          }
        >
          {(editor) => (
            <div className={styles.column}>
              <div className={styles.top}>
                {editor}
                {previewHidden ? null : (
                  <>
                    <ResizeHandle
                      orientation="vertical"
                      label={t("workspace.resize.preview.label")}
                      value={sizes.preview}
                      range={ranges.preview}
                      growsTowardEnd={false}
                      onResize={(previewWidth) => onPrefs({ previewWidth })}
                      onReset={() => onPrefs({ previewWidth: null })}
                    />
                    <div className={styles.right}>
                      {/* 缺工具在任何类型的项目里都是同一个画面 */}
                      {tab.failure !== null &&
                      previewScreenOf(tab) === "missing" &&
                      (script || tab.service === true) ? (
                        <MissingToolPane bridge={bridge} tab={tab} failure={tab.failure} />
                      ) : script ? (
                        <ScriptOutput bridge={bridge} tab={tab} />
                      ) : tab.service === true ? (
                        <RequestPanel key={tab.id} bridge={bridge} tab={tab} />
                      ) : (
                        <PreviewPane bridge={bridge} tab={tab} overlays={overlays} />
                      )}
                    </div>
                  </>
                )}
              </div>
              {consoleCollapsed ? null : (
                <ResizeHandle
                  orientation="horizontal"
                  label={t("workspace.resize.console.label")}
                  value={sizes.console}
                  range={ranges.console}
                  growsTowardEnd={false}
                  onResize={(consoleHeight) => onPrefs({ consoleHeight })}
                  onReset={() => onPrefs({ consoleHeight: null })}
                />
              )}
              <ConsolePanel bridge={bridge} tab={tab} />
            </div>
          )}
        </TabContent>
      </div>
    </div>
  );
}
