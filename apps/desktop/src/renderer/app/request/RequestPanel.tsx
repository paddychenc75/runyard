import { useT } from "@runyard/i18n/react";
import { useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { notReadyReason } from "../../../shared/request-model.ts";
import { AutoGrowText } from "./AutoGrowText.tsx";
import { RequestForm } from "./RequestForm.tsx";
import styles from "./RequestPanel.module.css";
import { RequestToolbar } from "./RequestToolbar.tsx";
import { ResponseView } from "./ResponseView.tsx";
import { useRequestPanel } from "./use-request-panel.ts";

export interface RequestPanelProps {
  bridge: DesktopBridge;
  tab: TabRow;
}

// 服务类项目右侧的请求面板（设计稿 Service，规格 desktop/request-panel）：上面一行是方法、
// 固定前缀 127.0.0.1:<端口> 加可编辑的路径和“发送”；下一行是请求头 / 请求体页签、自动重发开关、
// “复制为 curl”“在浏览器中打开”；下面是响应（状态、耗时、大小，响应体 / 响应头页签）。
// 请求只发往这个项目自己的端口：界面只给路径，主机和端口由管理进程按运行定。
export function RequestPanel({ bridge, tab }: RequestPanelProps) {
  const t = useT();
  const panel = useRequestPanel(bridge, tab);
  const [requestTab, setRequestTab] = useState("headers");
  const { draft } = panel;
  const reason = notReadyReason(tab);
  const canSend = reason === null;
  const blockedHint =
    reason === null
      ? null
      : reason === "starting"
        ? t("desktop.request.starting.hint")
        : t("desktop.request.stopped.hint");
  const prefix = tab.port === null ? "127.0.0.1" : `127.0.0.1:${tab.port}`;
  return (
    <section
      className={styles.root}
      data-request-panel={tab.id}
      aria-label={t("desktop.request.aria")}
    >
      <RequestForm panel={panel} prefix={prefix} canSend={canSend} blockedHint={blockedHint} />
      {reason === null ? null : (
        <p className={styles.hint} role="status" data-request-not-ready={reason}>
          {blockedHint}
        </p>
      )}
      <RequestToolbar
        panel={panel}
        tab={tab}
        canSend={canSend}
        requestTab={requestTab}
        setRequestTab={setRequestTab}
      />
      <div className={styles.editor}>
        {requestTab === "headers" ? (
          <AutoGrowText
            value={draft.headers}
            label={t("desktop.request.headers.label")}
            placeholder={t("desktop.request.headers.placeholder")}
            onChange={(headers) => panel.patch({ headers })}
          />
        ) : (
          <AutoGrowText
            value={draft.payload}
            label={t("desktop.request.payload.label")}
            placeholder={t("desktop.request.payload.placeholder")}
            onChange={(payload) => panel.patch({ payload })}
          />
        )}
      </div>
      <ResponseView response={panel.response} sending={panel.sending} reason={reason} />
    </section>
  );
}
