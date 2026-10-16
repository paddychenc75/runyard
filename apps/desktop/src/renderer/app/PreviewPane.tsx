import { useT } from "@runyard/i18n/react";
import { useState } from "react";
import type { DesktopBridge } from "../../shared/desktop-bridge.ts";
import type { Bounds } from "../../shared/layout.ts";
import type { TabRow } from "../../shared/library-state.ts";
import type { OverlayCounter } from "../shared/overlay-counter.ts";
import { PreviewSlot } from "../widgets/PreviewSlot.tsx";
import styles from "./PreviewPane.module.css";
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
// 页面就绪时主进程把原生预览视图摆在占位区上，没就绪时占位区显示一句说明。
// 地址栏上的刷新、在浏览器中打开、开发者工具不在 #175 范围（见 PR 的“与设计稿的差异”）。
export function PreviewPane({ bridge, tab, overlays }: PreviewPaneProps) {
  const t = useT();
  const [slot, setSlot] = useState<Bounds | null>(null);
  const frame = usePreviewSuspension(bridge, overlays, slot);
  return (
    <section
      className={styles.root}
      data-preview-pane={tab.id}
      data-ready={tab.previewUrl !== null}
    >
      <div className={styles.address}>
        <span className={styles.url}>{addressLabel(tab.previewUrl)}</span>
      </div>
      <PreviewSlot
        bridge={bridge}
        frame={frame}
        onBounds={setSlot}
        placeholder={tab.previewUrl === null ? t("desktop.preview.waiting.label") : null}
      />
    </section>
  );
}
