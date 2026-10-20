import { useT } from "@runyard/i18n/react";
import { IconButton, Tooltip } from "@runyard/ui";
import { type ReactNode, useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import type { TabRow } from "../../shared/library-state.ts";
import { useCommands } from "../shared/command-host.tsx";
import type { OverlayCounter } from "../shared/overlay-counter.ts";
import { PreviewSlot } from "../widgets/PreviewSlot.tsx";
import { AttachedNotice } from "./AttachedNotice.tsx";
import { CrashedNotice } from "./CrashedNotice.tsx";
import { FolderMissing } from "./FolderMissing.tsx";
import { previewScreenOf } from "./failure-view.ts";
import { MissingTool } from "./MissingTool.tsx";
import { PortChanged } from "./PortChanged.tsx";
import styles from "./PreviewPane.module.css";
import { PreviewStopped } from "./PreviewStopped.tsx";
import { SlowStart } from "./SlowStart.tsx";
import { StartFailed } from "./StartFailed.tsx";
import { StartProgress } from "./StartProgress.tsx";
import { usePreviewRefresh } from "./use-preview-refresh.ts";
import { usePreviewSuspension } from "./use-preview-suspension.ts";

export interface PreviewPaneProps {
  bridge: DesktopBridge;
  tab: TabRow;
  overlays: OverlayCounter;
}

/** 地址栏里显示的地址：去掉协议，和设计稿一样写成 127.0.0.1:7101/ */
export function addressLabel(url: string | null): string {
  return url === null ? "" : url.replace(/^http:\/\//, "");
}

// 标签页右侧的预览区（设计稿 Web、WebLight）：圆角卡片，上面是界面画的地址栏，下面是占位区——
// 页面就绪时主进程把原生预览视图摆在占位区上，没就绪时占位区按状态显示说明或失败画面
// （缺运行环境、依赖安装失败、启动较慢、崩溃，规格 DESKTOP-WORKSPACE-18 至 21）；
// 端口自动改用的说明在卡片最上面（规格 DESKTOP-WORKSPACE-22）。
// 启动进度画面没有页面可显示，设计稿 Creating 那里不画地址栏。
// 地址栏左边是“刷新”，右边是“在浏览器中打开”和“开发者工具”（规格 DESKTOP-WORKSPACE-31 至 33）。
export function PreviewPane({ bridge, tab, overlays }: PreviewPaneProps) {
  const t = useT();
  const refresh = usePreviewRefresh(bridge, tab.id, tab.previewUrl);
  const [slot, setSlot] = useState<Bounds | null>(null);
  // 用户点了“知道了”的端口说明：记下是哪一次改用，换了端口或再次改用会重新出现
  const [dismissed, setDismissed] = useState<string | null>(null);
  const suspended = usePreviewSuspension(bridge, overlays, slot);
  const screen = previewScreenOf(tab);
  // 命令面板里的刷新预览、在浏览器中打开、打开开发者工具：与地址栏上的按钮同一个条件（有页面可看）
  const hasPage = tab.previewUrl !== null && screen !== "starting";
  useCommands({
    "project.reloadPreview": hasPage && !refresh.loading ? refresh.reload : null,
    "project.openInBrowser": hasPage
      ? () => void bridge.call("preview.openExternal", tab.id)
      : null,
    "project.openDevtools": hasPage ? () => void bridge.call("preview.devtools", tab.id) : null,
  });
  let placeholder: ReactNode = null;
  let overlay: ReactNode;
  switch (screen) {
    case "folder-missing":
      placeholder = <FolderMissing bridge={bridge} tab={tab} />;
      break;
    case "waiting":
      placeholder = t("desktop.preview.waiting.label");
      break;
    case "starting":
      placeholder = <StartProgress bridge={bridge} tab={tab} />;
      break;
    case "stopped":
      placeholder = <PreviewStopped bridge={bridge} tab={tab} />;
      break;
    case "slow":
      placeholder = <SlowStart bridge={bridge} tab={tab} />;
      break;
    case "missing":
      placeholder = tab.failure && <MissingTool bridge={bridge} tab={tab} failure={tab.failure} />;
      break;
    case "start-failed":
      placeholder = tab.failure && <StartFailed bridge={bridge} tab={tab} failure={tab.failure} />;
      break;
    case "crashed":
      // 崩溃时原生视图已销毁，最后一帧是主进程在销毁前截下的，提示盖在它上面
      overlay = <CrashedNotice bridge={bridge} tab={tab} />;
      break;
    case "page":
      break;
  }
  const { portFallback } = tab;
  const portKey = portFallback === null ? null : `${portFallback.wanted}:${portFallback.actual}`;
  return (
    <section
      className={styles.root}
      data-preview-pane={tab.id}
      data-ready={tab.previewUrl !== null}
      data-screen={screen}
    >
      {tab.attached === null ? null : (
        <AttachedNotice bridge={bridge} tab={tab} attached={tab.attached} />
      )}
      {portFallback === null || portKey === dismissed ? null : (
        <div className={styles.notice}>
          <PortChanged fallback={portFallback} onDismiss={() => setDismissed(portKey)} />
        </div>
      )}
      {screen === "starting" || screen === "missing" ? null : (
        <div className={styles.address}>
          <IconButton
            icon="refresh"
            size="sm"
            label={t("desktop.preview.reload.action")}
            className={styles.refresh}
            aria-busy={refresh.refreshing}
            data-refreshing={refresh.refreshing}
            disabled={tab.previewUrl === null || refresh.loading}
            onClick={refresh.reload}
            onAnimationIteration={refresh.onAnimationIteration}
          />
          <span className={styles.url}>{addressLabel(tab.previewUrl)}</span>
          <Tooltip content={t("desktop.preview.openExternal.action")}>
            <IconButton
              icon="browser"
              size="sm"
              label={t("desktop.preview.openExternal.action")}
              disabled={tab.previewUrl === null}
              onClick={() => void bridge.call("preview.openExternal", tab.id)}
            />
          </Tooltip>
          <Tooltip content={t("desktop.preview.devtools.action")}>
            <IconButton
              icon="tools"
              size="sm"
              label={t("desktop.preview.devtools.action")}
              disabled={tab.previewUrl === null}
              onClick={() => void bridge.call("preview.devtools", tab.id)}
            />
          </Tooltip>
        </div>
      )}
      <PreviewSlot
        bridge={bridge}
        frame={screen === "crashed" ? tab.lastFrame : suspended}
        overlay={overlay}
        onBounds={setSlot}
        placeholder={placeholder}
      />
    </section>
  );
}
