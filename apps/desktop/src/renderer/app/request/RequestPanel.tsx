import type { Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import {
  type RequestFailureReason as FailureReason,
  type RequestMethod,
  requestMethods,
} from "@runyard/protocol";
import { Button, Icon, Menu, ScrollArea, SegmentedControl } from "@runyard/ui";
import { type ChangeEvent, useLayoutEffect, useRef, useState } from "react";
import type { DesktopBridge } from "../../../shared/desktop-bridge.ts";
import type { TabRow } from "../../../shared/library-state.ts";
import { formatBody, notReadyReason, statusTone } from "../../../shared/request-model.ts";
import { SettingSwitch } from "../settings/SettingSwitch.tsx";
import { JsonText } from "./JsonText.tsx";
import styles from "./RequestPanel.module.css";
import { type ShownResponse, useRequestPanel } from "./use-request-panel.ts";

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
  const prefix = tab.port === null ? "127.0.0.1" : `127.0.0.1:${tab.port}`;
  return (
    <section
      className={styles.root}
      data-request-panel={tab.id}
      aria-label={t("desktop.request.aria")}
    >
      <form
        className={styles.sendRow}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) panel.send();
        }}
      >
        <MethodMenu value={draft.method} onSelect={panel.setMethod} />
        <label className={styles.address}>
          <span className={styles.prefix}>{prefix}</span>
          <input
            className={styles.path}
            type="text"
            value={draft.path}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            aria-label={t("desktop.request.path.aria")}
            onChange={(event) => panel.patch({ path: event.target.value })}
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={!canSend}
          loading={panel.sending}
          onClick={(event) => {
            // 回车和点击都走表单提交，这里只防在途时再点
            if (panel.sending) event.preventDefault();
          }}
        >
          {t("desktop.request.send.action")}
        </Button>
      </form>
      {reason === null ? null : (
        <p className={styles.hint} role="status" data-request-not-ready={reason}>
          {reason === "starting"
            ? t("desktop.request.starting.hint")
            : t("desktop.request.stopped.hint")}
        </p>
      )}
      <div className={styles.toolRow}>
        <SegmentedControl
          label={t("desktop.request.tabs.aria")}
          value={requestTab}
          onValueChange={setRequestTab}
          items={[
            { value: "headers", label: t("desktop.request.headers.label") },
            { value: "payload", label: t("desktop.request.payload.label") },
          ]}
        />
        <span className={styles.spacer} />
        <span className={styles.autoResend}>
          <SettingSwitch
            label={t("desktop.request.autoResend.label")}
            checked={panel.autoResend}
            onCheckedChange={panel.setAutoResend}
          />
          {t("desktop.request.autoResend.label")}
        </span>
        <Button size="sm" disabled={tab.port === null} onClick={panel.copyCurl}>
          {panel.copied ? t("desktop.request.copied.label") : t("desktop.request.copyCurl.action")}
        </Button>
        <Button
          size="sm"
          disabled={!canSend || draft.method !== "GET"}
          onClick={panel.openInBrowser}
        >
          {t("desktop.request.openInBrowser.action")}
        </Button>
      </div>
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
      <ResponseView response={panel.response} sending={panel.sending} />
    </section>
  );
}

function MethodMenu({
  value,
  onSelect,
}: {
  value: RequestMethod;
  onSelect: (method: RequestMethod) => void;
}) {
  const t = useT();
  return (
    <Menu
      label={t("desktop.request.method.aria")}
      trigger={
        <button type="button" className={styles.method} data-method={value}>
          {value}
          <Icon name="chevron-down" size={10} />
        </button>
      }
      entries={requestMethods.map((method) => ({
        id: method,
        label: t("desktop.request.methodOption.label", { method }),
        checked: method === value,
      }))}
      onSelect={(id) => onSelect(id as RequestMethod)}
    />
  );
}

// 请求头和请求体的文本框：随内容长高，外面的滚动区（ScrollArea）负责滚动，滚动条是全应用统一的那一种
function AutoGrowText({
  value,
  label,
  placeholder,
  onChange,
}: {
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.style.blockSize = "auto";
    element.style.blockSize = `${element.scrollHeight}px`;
  }, [value]);
  return (
    <ScrollArea className={styles.editorScroll}>
      <textarea
        ref={field}
        className={styles.textarea}
        value={value}
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
      />
    </ScrollArea>
  );
}

function ResponseView({ response, sending }: { response: ShownResponse | null; sending: boolean }) {
  const t = useT();
  const fmt = useFormat();
  const [shown, setShown] = useState("payload");
  const result = response?.result;
  return (
    <div
      className={styles.response}
      data-request-response={result?.outcome ?? (sending ? "pending" : "empty")}
    >
      <div className={styles.responseHead}>
        <span className={styles.responseTitle}>{t("desktop.request.response.title")}</span>
        {result?.outcome === "response" ? (
          <>
            <span className={styles.status} data-tone={statusTone(result.status)}>
              {`${result.status} ${result.statusText}`.trim()}
            </span>
            <span className={styles.meta}>
              {t("desktop.request.meta.label", {
                duration: fmt.technicalDuration(result.durationMs),
                size: fmt.fileSize(result.size),
              })}
            </span>
          </>
        ) : null}
        <span className={styles.spacer} />
        {response?.auto === true ? (
          <span className={styles.autoStamp}>
            {t("desktop.request.autoResent.label", { time: fmt.time(response.at) })}
          </span>
        ) : null}
      </div>
      {result?.outcome === "response" ? (
        <>
          <div className={styles.responseTabs}>
            <SegmentedControl
              label={t("desktop.request.responseTabs.aria")}
              value={shown}
              onValueChange={setShown}
              items={[
                { value: "payload", label: t("desktop.request.responseBody.label") },
                { value: "headers", label: t("desktop.request.responseHeaders.label") },
              ]}
            />
          </div>
          <ScrollArea
            orientation="both"
            className={styles.output}
            viewportClassName={styles.outputViewport}
            viewportProps={{ "aria-label": t("desktop.request.response.title"), role: "region" }}
          >
            {shown === "payload" ? (
              <BodyText payload={result.payload} />
            ) : (
              <HeaderList headers={result.headers} />
            )}
          </ScrollArea>
        </>
      ) : (
        <p
          className={styles.placeholder}
          role="status"
          data-tone={result === undefined ? "quiet" : "failure"}
        >
          {result === undefined
            ? sending
              ? t("desktop.request.pending.label")
              : t("desktop.request.empty.label")
            : failureText(t, result.reason)}
        </p>
      )}
    </div>
  );
}

// 失败原因的文字：每个键都以字面量写在 t() 里，文案检查才认得出它们被用到
function failureText(t: ReturnType<typeof useT>, reason: FailureReason): Localized {
  switch (reason) {
    case "timeout":
      return t("desktop.request.timeout.label");
    case "unreachable":
      return t("desktop.request.unreachable.label");
    case "disconnected":
      return t("desktop.request.disconnected.label");
    case "not-ready":
      return t("desktop.request.notReady.label");
    case "too-large":
      return t("desktop.request.tooLarge.label");
    case "invalid-request":
      return t("desktop.request.invalid.label");
  }
}

function BodyText({ payload }: { payload: string }) {
  const t = useT();
  if (payload === "") {
    return <span className={styles.quiet}>{t("desktop.request.bodyEmpty.label")}</span>;
  }
  const { text, json } = formatBody(payload);
  return <pre className={styles.pre}>{json ? <JsonText text={text} /> : text}</pre>;
}

function HeaderList({ headers }: { headers: readonly { name: string; value: string }[] }) {
  return (
    <dl className={styles.headerList}>
      {headers.map(({ name, value }, index) => (
        // 同名的头可以出现多次，所以键带序号
        <div key={`${index}:${name}`} className={styles.headerLine}>
          <dt className={styles.key}>{name}</dt>
          <dd className={styles.headerValue}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
