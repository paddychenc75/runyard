import type { Localized } from "@runyard/i18n";
import { useFormat, useT } from "@runyard/i18n/react";
import type { RequestFailureReason as FailureReason } from "@runyard/protocol";
import { Icon, ScrollArea, SegmentedControl } from "@runyard/ui";
import { useState } from "react";
import { formatBody, type notReadyReason, statusTone } from "../../../shared/request-model.ts";
import { JsonText } from "./JsonText.tsx";
import styles from "./RequestPanel.module.css";
import type { ShownResponse } from "./use-request-panel.ts";

export function ResponseView({
  response,
  sending,
  reason,
}: {
  response: ShownResponse | null;
  sending: boolean;
  reason: ReturnType<typeof notReadyReason>;
}) {
  const t = useT();
  const [shown, setShown] = useState("payload");
  const result = response?.result;
  return (
    <div
      className={styles.response}
      data-request-response={result?.outcome ?? (sending ? "pending" : "empty")}
      data-stale={reason !== null && result?.outcome === "response" ? "true" : undefined}
    >
      {reason !== null && result?.outcome === "response" ? (
        <p className={styles.staleNote} role="status">
          <Icon name="warning" size={14} />
          {reason === "starting"
            ? t("desktop.request.previousResponse.label")
            : t("desktop.request.stoppedResponse.label")}
        </p>
      ) : null}
      <ResponseHead response={response} />
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

function ResponseHead({ response }: { response: ShownResponse | null }) {
  const t = useT();
  const fmt = useFormat();
  const result = response?.result;
  return (
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
